import {env} from 'cloudflare:workers';
import {z,ZodError} from 'zod';
import {getChatGPTUser} from '../../chatgpt-auth';
import {findMembership} from '../../../lib/collaboration-server';
import {blank,stateSchema} from '../../../lib/ledger';
import {buyerLedger,buyerMemberInput,defaultUrgencies,normalizePurchase,purchaseView,urgencyListSchema,type PurchaseRow} from '../../../lib/procurement';
import type {MemberRow} from '../../../lib/collaboration';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function settings(owner:string){const row=await env.DB!.prepare('SELECT * FROM procurement_settings WHERE owner=?').bind(owner).first<{data:string;revision:number}>();return {urgencies:row?urgencyListSchema.parse(JSON.parse(row.data)):defaultUrgencies,revision:row?.revision||0};}
const memberView=(m:MemberRow)=>({id:m.id,name:m.name,email:m.email,active:!!m.active,revision:m.revision});
export async function GET(request:Request){const user=await getChatGPTUser();if(!user)return json({error:'Войдите через ChatGPT'},401);const member=await findMembership(env.DB!,user);if(member&&(!member.active||member.role!=='buyer'))return json({error:'Нет доступа закупщика'},403);const owner=member?.owner||user.userId,db=env.DB!,s=await settings(owner);
 if(new URL(request.url).searchParams.get('summary')==='1'){const count=await db.prepare('SELECT COUNT(*) AS count FROM procurement_requests WHERE owner=? AND seen_at IS NULL'+(member?' AND member_id=?':'')).bind(...(member?[owner,member.id]:[owner])).first<{count:number}>();return json({role:member?'buyer':'admin',unread:count?.count||0});}
 const requests=await db.prepare('SELECT * FROM procurement_requests WHERE owner=?'+(member?' AND member_id=?':'')+' ORDER BY updated_at DESC LIMIT 1000').bind(...(member?[owner,member.id]:[owner])).all<PurchaseRow>();
 const members=member?[]:(await db.prepare("SELECT * FROM ledger_members WHERE owner=? AND role='buyer' ORDER BY created_at DESC").bind(owner).all<MemberRow>()).results.map(memberView);
 let state;if(member||new URL(request.url).searchParams.get('view')==='buyer'){const row=await db.prepare('SELECT data FROM ledgers WHERE owner=?').bind(owner).first<{data:string}>();state=buyerLedger(row?stateSchema.parse(JSON.parse(row.data)):blank);}
 return json({role:member?'buyer':'admin',member:member?memberView(member):undefined,members,requests:requests.results.map(purchaseView),urgencies:s.urgencies,settingsRevision:s.revision,unread:requests.results.filter(r=>!r.seen_at).length,state});
}
export async function POST(request:Request){const user=await getChatGPTUser();if(!user)return json({error:'Войдите через ChatGPT'},401);if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Недопустимый источник запроса'},403);const db=env.DB!,member=await findMembership(db,user);if(member&&(!member.active||member.role!=='buyer'))return json({error:'Нет доступа закупщика'},403);const owner=member?.owner||user.userId;
 try{const raw=await request.text();if(raw.length>150000)return json({error:'Слишком большой запрос'},413);const body=JSON.parse(raw),now=new Date().toISOString(),event=crypto.randomUUID();
 const audit=(action:string,id:string,detail:unknown,guard:string,args:unknown[])=>db.prepare('INSERT INTO collaboration_audit (id,owner,actor,action,subject,detail,created_at) SELECT ?,?,?,?,?,?,? WHERE '+guard).bind(event,owner,user.email,action,id,JSON.stringify(detail),now,...args);
 if(body.action==='submit'){
  const current=await settings(owner),p=normalizePurchase(body.purchase,current.urgencies),old=await db.prepare('SELECT * FROM procurement_requests WHERE id=? AND owner=?').bind(p.id,owner).first<PurchaseRow>();
  if(old&&member&&old.member_id!==member.id)return json({error:'Эта заявка недоступна'},403);
  if(old&&member&&old.status!=='new')return json({error:'Заявка уже принята в работу. Создайте новую заявку на изменения.'},409);
  if(old&&p.revision===undefined){const original=JSON.parse(old.payload);return JSON.stringify({...original,revision:undefined})===JSON.stringify({...p,revision:undefined})?json({id:old.id}):json({error:'Номер заявки уже используется'},409);}
  const payload=JSON.stringify(p),guard=member?' AND EXISTS (SELECT 1 FROM ledger_members WHERE id=? AND active=1 AND revision=? AND role=\'buyer\')':'',args=member?[member.id,member.revision]:[];
  const settingGuard=" AND COALESCE((SELECT revision FROM procurement_settings WHERE owner=?),0)=?",settingArgs=[owner,current.revision];
  const statement=old?db.prepare('UPDATE procurement_requests SET payload=?,revision=revision+1,updated_at=?,seen_at=NULL,change_key=? WHERE id=? AND owner=? AND revision=?'+guard+settingGuard).bind(payload,now,event,p.id,owner,p.revision,...args,...settingArgs):db.prepare("INSERT INTO procurement_requests (id,owner,member_id,author,payload,change_key,status,created_at,updated_at) SELECT ?,?,?,?,?,?,'new',?,? WHERE 1=1"+guard+settingGuard).bind(p.id,owner,member?.id||'admin',member?.name||'Администратор',payload,event,now,now,...args,...settingArgs);
  const revision=old?old.revision+1:0;const results=await db.batch([statement,audit('purchase_submitted',p.id,{title:p.title,positions:p.items.length},'EXISTS (SELECT 1 FROM procurement_requests WHERE id=? AND owner=? AND revision=? AND change_key=?)',[p.id,owner,revision,event])]);if(!results[0].meta.changes)return json({error:'Заявка, доступ или статусы изменились. Обновите страницу.'},409);return json({id:p.id},old?200:201);
 }
 if(member)return json({error:'Действие доступно только администратору'},403);
 if(body.action==='settings'){
  const urgencies=urgencyListSchema.parse(body.urgencies),revision=z.number().int().nonnegative().parse(body.revision),old=await settings(owner);
  // Soft removal retains historical labels and IDs.
  if(old.urgencies.some(u=>!urgencies.some(x=>x.id===u.id)))return json({error:'Удаляемые статусы нужно пометить удалёнными'},400);
  await db.prepare('INSERT INTO procurement_settings (owner,data,revision) VALUES (?,?,0) ON CONFLICT(owner) DO NOTHING').bind(owner,JSON.stringify(defaultUrgencies)).run();const data=JSON.stringify(urgencies);
  const results=await db.batch([db.prepare('UPDATE procurement_settings SET data=?,revision=revision+1 WHERE owner=? AND revision=?').bind(data,owner,revision),audit('purchase_statuses_updated',owner,{},'EXISTS (SELECT 1 FROM procurement_settings WHERE owner=? AND revision=? AND data=?)',[owner,revision+1,data])]);return results[0].meta.changes?json({status:'saved'}):json({error:'Статусы изменились. Обновите страницу'},409);
 }
 if(body.action==='review'){
  const p=z.object({id:z.string().uuid(),revision:z.number().int().nonnegative(),status:z.enum(['new','reviewed','ordered'])}).parse(body);const results=await db.batch([db.prepare('UPDATE procurement_requests SET status=?,seen_at=?,revision=revision+1,updated_at=?,change_key=? WHERE id=? AND owner=? AND revision=?').bind(p.status,now,now,event,p.id,owner,p.revision),audit('purchase_reviewed',p.id,{status:p.status},'EXISTS (SELECT 1 FROM procurement_requests WHERE id=? AND owner=? AND revision=? AND change_key=?)',[p.id,owner,p.revision+1,event])]);return results[0].meta.changes?json({status:'saved'}):json({error:'Заявка изменилась. Обновите страницу'},409);
 }
 if(body.action==='member'){
  const p=buyerMemberInput.parse(body.member);if(p.email===user.email.toLowerCase())return json({error:'Нельзя назначить себя закупщиком'},400);const old=p.id?await db.prepare("SELECT * FROM ledger_members WHERE id=? AND owner=? AND role='buyer'").bind(p.id,owner).first<MemberRow>():null;if(p.id&&!old)return json({error:'Закупщик не найден'},404);
  const duplicate=await db.prepare('SELECT id FROM ledger_members WHERE email=? AND id<>?').bind(p.email,p.id||'').first();if(duplicate)return json({error:'Эта почта уже имеет доступ. Выберите другой аккаунт.'},409);
  const id=p.id||crypto.randomUUID();let statements:D1PreparedStatement[];
  if(old&&old.email!==p.email){const replacement=crypto.randomUUID();statements=[db.prepare('UPDATE ledger_members SET active=0,revision=revision+1,change_key=? WHERE id=? AND owner=? AND revision=?').bind(event,id,owner,p.revision),db.prepare("INSERT INTO ledger_members (id,owner,email,name,wallet_id,shipment_ids,role,active,created_at,change_key) SELECT ?,?,?,?,'','[]','buyer',?,?,? WHERE EXISTS (SELECT 1 FROM ledger_members WHERE id=? AND owner=? AND change_key=?)").bind(replacement,owner,p.email,p.name,+p.active,now,event,id,owner,event),audit('buyer_access_updated',replacement,{name:p.name,email:p.email},'EXISTS (SELECT 1 FROM ledger_members WHERE id=? AND change_key=?)',[replacement,event])];}
  else{statements=[old?db.prepare('UPDATE ledger_members SET name=?,active=?,revision=revision+1,change_key=? WHERE id=? AND owner=? AND revision=?').bind(p.name,+p.active,event,id,owner,p.revision):db.prepare("INSERT INTO ledger_members (id,owner,email,name,wallet_id,shipment_ids,role,active,created_at,change_key) VALUES (?,?,?,?,'','[]','buyer',?,?,?)").bind(id,owner,p.email,p.name,+p.active,now,event),audit('buyer_access_updated',id,{name:p.name,email:p.email},'EXISTS (SELECT 1 FROM ledger_members WHERE id=? AND change_key=?)',[id,event])];}
  const results=await db.batch(statements);return results[0].meta.changes?json({status:'saved'}):json({error:'Доступ изменился. Обновите страницу'},409);
 }
 return json({error:'Неизвестное действие'},400);
 }catch(e){return json({error:e instanceof ZodError?e.issues[0]?.message:e instanceof Error?e.message:'Не удалось сохранить'},400);}
}
