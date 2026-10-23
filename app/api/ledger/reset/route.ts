import {env} from 'cloudflare:workers';
import {findMembership} from '../../../../lib/collaboration-server';
import {getChatGPTUser} from '../../../chatgpt-auth';
import {stateSchema,clearExperimentData,wallet,walletAccounts} from '../../../../lib/ledger';
import {z} from 'zod';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){
  const user=await getChatGPTUser();if(!user)return json({error:'Войдите через ChatGPT'},401);if((await findMembership(env.DB!,user))?.role==='buyer')return json({error:'Действие недоступно закупщику'},403);
  const row=await env.DB!.prepare('SELECT data, revision FROM ledgers WHERE owner = ?').bind(user.userId).first<{data:string;revision:number}>();
  const backup=row?stateSchema.parse(JSON.parse(row.data)).resetBackup:undefined;
  if(!backup||!backup.key.startsWith(`ledger-backups/${user.userId}/`))return json({error:'Копия не найдена'},404);
  const object=await env.BUCKET?.get(backup.key);if(!object)return json({error:'Копия не найдена'},404);
  return new Response(object.body,{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="china-ledger-before-reset.json"','Cache-Control':'no-store'}});
}
// Short-lived operator access is scoped to one configured owner and expires automatically.
// It never impersonates a visitor or permits arbitrary database operations.
export async function POST(request:Request){
  if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Недопустимый источник'},403);
  if(!env.LEDGER_RESET_TOKEN||!env.LEDGER_RESET_OWNER||Date.now()>=Number(env.LEDGER_RESET_EXPIRES||0)||request.headers.get('authorization')!==`Bearer ${env.LEDGER_RESET_TOKEN}`)return json({error:'Нет доступа'},401);
  const parsed=z.object({expectedRevision:z.number().int().min(0),clearShipments:z.boolean().optional()}).safeParse(await request.json().catch(()=>null));if(!parsed.success)return json({error:'Укажите версию данных'},400);
  if(!env.BUCKET)return json({error:'Хранилище копий недоступно'},503);
  const owner=env.LEDGER_RESET_OWNER;
  const row=await env.DB!.prepare('SELECT data, revision FROM ledgers WHERE owner = ?').bind(owner).first<{data:string;revision:number}>();
  if(!row||row.revision!==parsed.data.expectedRevision)return json({error:'Данные изменились; очистка не выполнена'},409);
  if(parsed.data.clearShipments){const attachments=await env.DB!.prepare('SELECT COUNT(*) AS count FROM attachments WHERE owner = ?').bind(owner).first<{count:number}>();if(attachments&&attachments.count>0)return json({error:'У грузов есть вложения. Сначала сохраните и удалите их; очистка не выполнена.'},409);}
  const original=stateSchema.parse(JSON.parse(row.data));const createdAt=new Date().toISOString();
  const key=`ledger-backups/${owner}/before-reset-${row.revision}-${crypto.randomUUID()}.json`;
  await env.BUCKET.put(key,JSON.stringify({exportedAt:createdAt,state:original},null,2),{httpMetadata:{contentType:'application/json'}});
  const state=stateSchema.parse({...clearExperimentData(original),...(parsed.data.clearShipments?{shipments:[]}:{}),resetBackup:{key,createdAt,revision:row.revision}});
  const updated=await env.DB!.prepare('UPDATE ledgers SET data = ?, revision = revision + 1 WHERE owner = ? AND revision = ?').bind(JSON.stringify(state),owner,row.revision).run();
  if(!updated.meta.changes)return json({error:'Данные изменились; очистка не выполнена'},409);
  return json({revision:row.revision+1,backupSaved:true,suppliers:state.suppliers?.length||0,transactions:state.transactions.length,shipmentsPreserved:state.shipments.length,shipmentsRemoved:original.shipments.length-state.shipments.length,wallets:walletAccounts(state).map(w=>({id:w.id,balances:wallet(state,w.id).balances}))});
}
