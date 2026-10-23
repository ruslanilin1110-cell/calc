import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {getChatGPTUser} from '../../chatgpt-auth';
import {findMembership} from '../../../lib/collaboration-server';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const input=z.object({id:z.string().uuid(),shipmentId:z.string().uuid(),body:z.string().trim().min(1,'Напишите сообщение').max(4000,'Не более 4000 символов')});
type Message={seq:number;id:string;owner:string;shipment_id:string;actor_id:string;actor_name:string;actor_role:string;body:string;created_at:string};
const view=(m:Message,userId:string)=>({seq:m.seq,id:m.id,body:m.body,author:m.actor_name,role:m.actor_role,createdAt:m.created_at,mine:m.actor_id===userId});
async function access(user:{userId:string;email:string},shipmentId:string){
 const db=env.DB!,member=await findMembership(db,user);
 if(member&&(!member.active||(member.role!=='buyer'&&!(JSON.parse(member.shipment_ids) as string[]).includes(shipmentId))))return null;
 const owner=member?.owner||user.userId;
 const exists=await db.prepare("SELECT 1 FROM ledgers,json_each(ledgers.data,'$.shipments') s WHERE owner=? AND json_extract(s.value,'$.id')=?").bind(owner,shipmentId).first();
 return exists?{owner,member}:null;
}
export async function GET(request:Request){
 const user=await getChatGPTUser();if(!user)return json({error:'Войдите через ChatGPT'},401);
 const params=new URL(request.url).searchParams,shipmentId=params.get('shipmentId');
 if(!z.string().uuid().safeParse(shipmentId).success)return json({error:'Неверный груз'},400);
 const before=params.get('before'),after=params.get('after');
 if((before&&after)||[before,after].some(x=>x!==null&&(!/^\d+$/.test(x)||!Number.isSafeInteger(Number(x))||Number(x)<1)))return json({error:'Неверная страница переписки'},400);
 const allowed=await access(user,shipmentId!);if(!allowed)return json({error:'Чат груза недоступен'},403);
 const clause=before?' AND seq < ?':after?' AND seq > ?':'',args:unknown[]=[allowed.owner,shipmentId];if(before||after)args.push(Number(before||after));
 const rows=await env.DB!.prepare(`SELECT * FROM shipment_messages WHERE owner=? AND shipment_id=?${clause} ORDER BY seq ${after?'ASC':'DESC'} LIMIT 51`).bind(...args).all<Message>();
 const more=rows.results.length>50,selected=rows.results.slice(0,50);if(!after)selected.reverse();
 return json({messages:selected.map(m=>view(m,user.userId)),hasMore:more});
}
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return json({error:'Войдите через ChatGPT'},401);
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Недопустимый источник запроса'},403);
 const raw=await request.text();if(raw.length>20000)return json({error:'Сообщение слишком большое'},413);
 const p=input.safeParse((()=>{try{return JSON.parse(raw)}catch{return null}})());if(!p.success)return json({error:p.error.issues[0]?.message||'Проверьте сообщение'},400);
 const {id,shipmentId,body}=p.data,allowed=await access(user,shipmentId);if(!allowed)return json({error:'Чат груза недоступен'},403);
 if(allowed.member?.role==='buyer')return json({error:'Закупщику доступен только просмотр'},403);const {owner,member}=allowed,db=env.DB!,createdAt=new Date().toISOString(),name=member?.name||'Администратор',role=member?'carrier':'admin';
 const guard=member?" AND EXISTS (SELECT 1 FROM ledger_members WHERE id=? AND active=1 AND revision=? AND user_id=? AND EXISTS (SELECT 1 FROM json_each(ledger_members.shipment_ids) a WHERE a.value=?))":'';
 const args:unknown[]=[id,owner,shipmentId,user.userId,name,role,body,createdAt,owner,shipmentId];if(member)args.push(member.id,member.revision,user.userId,shipmentId);
 await db.prepare("INSERT INTO shipment_messages (id,owner,shipment_id,actor_id,actor_name,actor_role,body,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM ledgers,json_each(ledgers.data,'$.shipments') s WHERE owner=? AND json_extract(s.value,'$.id')=?)"+guard+' ON CONFLICT(id) DO NOTHING').bind(...args).run();
 const message=await db.prepare('SELECT * FROM shipment_messages WHERE id=? AND owner=? AND shipment_id=? AND actor_id=?').bind(id,owner,shipmentId,user.userId).first<Message>();
 if(!message||message.body!==body)return json({error:'Сообщение не сохранено. Обновите чат и повторите отправку.'},409);
 return json({message:view(message,user.userId)},201);
}
