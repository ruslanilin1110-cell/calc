import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {getChatGPTUser} from '../../../chatgpt-auth';
import {findMembership} from '../../../../lib/collaboration-server';
import {purchaseView,type PurchaseRow} from '../../../../lib/procurement';
import {purchaseXlsx} from '../../../../lib/purchase-export';
export const dynamic='force-dynamic';
const json=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){const user=await getChatGPTUser();if(!user)return json('Войдите через ChatGPT',401);const member=await findMembership(env.DB!,user);if(member&&(!member.active||member.role!=='buyer'))return json('Нет доступа к заявкам',403);const id=new URL(request.url).searchParams.get('id');if(!z.string().uuid().safeParse(id).success)return json('Неверная заявка',400);const owner=member?.owner||user.userId,row=await env.DB!.prepare('SELECT * FROM procurement_requests WHERE id=? AND owner=?'+(member?' AND member_id=?':'')).bind(...(member?[id,owner,member.id]:[id,owner])).first<PurchaseRow>();if(!row)return json('Заявка не найдена',404);const p=purchaseView(row);return new Response(purchaseXlsx(p),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="china-order-${p.id.slice(0,8)}.xlsx"; filename*=UTF-8''${encodeURIComponent('Заявка-Китай-'+p.createdAt.slice(0,10)+'.xlsx')}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
