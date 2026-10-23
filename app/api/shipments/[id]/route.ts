import {env} from 'cloudflare:workers';
import {findMembership} from '../../../../lib/collaboration-server';
import {getChatGPTUser} from '../../../chatgpt-auth';
import {stateSchema} from '../../../../lib/ledger';
import {z} from 'zod';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function DELETE(request:Request,context:{params:Promise<{id:string}>}){
 const user=await getChatGPTUser();if(!user)return json({error:'Войдите через ChatGPT'},401);if((await findMembership(env.DB!,user))?.role==='buyer')return json({error:'Действие недоступно закупщику'},403);
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Недопустимый источник запроса'},403);
 const {id}=await context.params;if(!z.string().uuid().safeParse(id).success)return json({error:'Неверный груз'},400);
 let input;try{input=z.object({revision:z.number().int().min(0)}).parse(await request.json())}catch{return json({error:'Неверные данные'},400)}
 const row=await env.DB!.prepare('SELECT data, revision FROM ledgers WHERE owner = ?').bind(user.userId).first<{data:string;revision:number}>();
 if(!row)return json({error:'Груз не найден'},404);
 const state=stateSchema.parse(JSON.parse(row.data)),shipment=state.shipments.find(s=>s.id===id);
 if(!shipment)return json({error:'Груз не найден'},404);
 if(row.revision!==input.revision)return json({error:'Данные изменились. Обновите страницу и повторите удаление.'},409);
 if(state.transactions.some(t=>t.shipmentId===id))return json({error:'У груза есть проведённые операции. Сначала удалите или перенесите их через «Операции по грузу», затем удалите груз.'},409);
 const next={...state,shipments:state.shipments.filter(s=>s.id!==id)},serialized=JSON.stringify(next);
 const guard="EXISTS (SELECT 1 FROM ledgers WHERE owner = ? AND revision = ? AND data = ?)";
 const results=await env.DB!.batch([
  env.DB!.prepare("UPDATE ledgers SET data = ?, revision = revision + 1 WHERE owner = ? AND revision = ? AND NOT EXISTS (SELECT 1 FROM payment_requests WHERE owner = ? AND status = 'pending' AND json_extract(payload, '$.shipmentId') = ?)").bind(serialized,user.userId,input.revision,user.userId,id),
  env.DB!.prepare(`DELETE FROM attachments WHERE owner = ? AND shipment_id = ? AND ${guard} RETURNING object_key`).bind(user.userId,id,user.userId,input.revision+1,serialized),
  env.DB!.prepare(`DELETE FROM shipment_messages WHERE owner = ? AND shipment_id = ? AND ${guard}`).bind(user.userId,id,user.userId,input.revision+1,serialized),
  env.DB!.prepare(`INSERT INTO collaboration_audit (id,owner,actor,action,subject,detail,created_at) SELECT ?,?,?,?,?,?,? WHERE ${guard}`).bind(crypto.randomUUID(),user.userId,user.userId,'cargo_deleted',id,shipment.name,new Date().toISOString(),user.userId,input.revision+1,serialized)
 ]);
 if(!results[0].meta.changes)return json({error:'Груз не удалён: есть оплаты на подтверждении или данные изменились. Проверьте заявки и обновите страницу.'},409);
 const keys=(results[1].results as {object_key:string}[]).map(x=>x.object_key);
 if(env.BUCKET)await Promise.allSettled(keys.map(key=>env.BUCKET!.delete(key)));
 return json({state:next,revision:input.revision+1});
}
