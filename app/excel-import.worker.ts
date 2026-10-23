import {readOrderWorkbook} from '../lib/excel-reader';
self.onmessage=(event:MessageEvent<ArrayBuffer>)=>{try{self.postMessage({data:readOrderWorkbook(event.data)})}catch(e){self.postMessage({error:e instanceof Error?e.message:'Не удалось прочитать Excel. Проверьте, что файл не повреждён и не защищён паролем.'})}};
