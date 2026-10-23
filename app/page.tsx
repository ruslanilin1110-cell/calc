import {env} from 'cloudflare:workers';
import {findMembership} from '../lib/collaboration-server';
import {ClientPortal} from './collaboration-ui';
import {BuyerPortal} from './procurement-ui';
import LedgerApp from './ledger-app';
import {requireChatGPTUser} from './chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Home(){const user=await requireChatGPTUser('/');const member=await findMembership(env.DB!,user);return member?(member.role==='buyer'?<BuyerPortal/>:<ClientPortal/>):<LedgerApp/>;}
