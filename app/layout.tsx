import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Мои закупки · Китай',description:'Личный учёт закупок, валюты, денег у посредника и доставки',icons:{icon:'/favicon.svg'},appleWebApp:{capable:true,title:'Мои закупки',statusBarStyle:'default'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ru"><body>{children}</body></html>}
