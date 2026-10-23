import {getDocument,PDFWorker,version} from 'pdfjs-dist';
import {parsePdfOrder,type PdfWord} from '../lib/pdf-order';
export async function readOrderPdf(buffer:ArrayBuffer,signal:AbortSignal){
 const bytes=new Uint8Array(buffer);if(bytes.byteLength>5*1024*1024)throw Error('Размер файла — не более 5 МБ.');if(String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')throw Error('Файл не является PDF. Проверьте формат.');
 const port=new Worker('/pdfjs-worker/pdf.worker.min.mjs?v='+version,{type:'module'}),worker=PDFWorker.create({port}),task=getDocument({data:bytes,worker,disableFontFace:true,stopAtErrors:true});
 const cancel=()=>{worker.destroy();port.terminate();void task.destroy().catch(()=>{})};signal.addEventListener('abort',cancel,{once:true});
 try{if(signal.aborted)throw Error('Чтение PDF отменено');const doc=await task.promise;if(doc.numPages>30)throw Error('В PDF допускается не более 30 страниц. Разделите заказ.');const pages:PdfWord[][]=[];let count=0;
 for(let i=1;i<=doc.numPages;i++){if(signal.aborted)throw Error('Чтение PDF отменено');const page=await doc.getPage(i),text=await page.getTextContent();const words:PdfWord[]=text.items.flatMap(item=>'str' in item?[{str:item.str,x:item.transform[4],y:item.transform[5],width:item.width,height:item.height}]:[]);count+=words.length;if(count>50000)throw Error('Слишком большая таблица PDF. Разделите заказ.');pages.push(words);page.cleanup()}
 return parsePdfOrder(pages);
 }catch(e){if(e instanceof Error&&e.name==='PasswordException')throw Error('PDF защищён паролем. Снимите защиту и загрузите файл снова.');throw e}finally{signal.removeEventListener('abort',cancel);try{await task.destroy()}finally{worker.destroy();port.terminate()}}
}
