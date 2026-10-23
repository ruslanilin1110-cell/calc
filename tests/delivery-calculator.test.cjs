const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function compile(path,overrides={}){const m={exports:{}};const src=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','module','exports',src)(id=>overrides[id]||(id==='./excel-import'||id==='./shipment-ui'||id==='./shipment-chat'?{}:(/cargo-products|cargo-cost|procurement-ui/.test(id)?{}:require(id))),m,m.exports);return m.exports}
const lib=compile('lib/ledger.ts'),{calculateDelivery:calc,calculateFullDeliveryCost:fullCost}=compile('lib/delivery-calculator.ts',{'./ledger':lib});
const id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
const item=(n,extra={})=>({id:id(n),name:'Товар '+n,quantity:100,unit:'шт.',weight:500,weightUnit:'g',weightMode:'unit',...extra});
const config={mode:'perKg',currency:'USD',rateKzt:500,price:110,items:[item(1,{goodsUnitPriceKzt:100000}),item(2,{quantity:50,weight:50,weightUnit:'kg',weightMode:'total'})]};
let r=calc(config);assert.equal(r.totalWeightKg,100);assert.equal(r.totalKzt,5500000);assert.equal(r.items[0].deliveryKzt,2750000);assert.equal(r.items[0].deliveryPerUnitKzt,27500);assert.equal(r.items[0].landedPerUnitKzt,127500);assert.equal(r.items[1].landedKzt,null);
// Convert at full precision before rounding to tiyn, including tiny weights.
assert.equal(calc({...config,items:[item(1,{quantity:1,weight:5})]}).totalKzt,275);
for(const total of [0,1,2,100,10001,99999999999999]){r=calc({...config,mode:'total',currency:'KZT',rateKzt:1,price:total,items:[item(1),item(2),item(3)]});assert.equal(r.items.reduce((n,x)=>n+x.deliveryKzt,0),total);assert(r.items.every(x=>Number.isInteger(x.deliveryKzt)&&x.deliveryKzt>=0));}
r=calc({...config,mode:'recorded'},12345);assert.equal(r.totalKzt,12345);assert.equal(r.items.reduce((n,x)=>n+x.deliveryKzt,0),12345);
r=calc({...config,items:[item(1,{quantity:2.5,weight:0.2,weightUnit:'kg'})]});assert.equal(r.totalWeightKg,.5);assert.equal(r.totalKzt,27500);
for(const invalid of [{items:[]},{items:[item(1,{weight:0})]},{items:[item(1),item(1)]},{rateKzt:0},{price:-1},{items:[item(1,{quantity:1e9,weight:1e9})]}])assert.throws(()=>calc({...config,...invalid}));
assert.throws(()=>calc({...config,mode:'recorded'},-1));assert.throws(()=>calc({...config,price:1e14,rateKzt:1e8}));
const shipment={id:id(9),name:'Партия',supplier:'Завод',currency:'CNY',orderTotal:10000,quantity:150,unit:'шт.',ordered:'2026-10-21',expected:'',arrived:'',status:'ordered',tracking:'',notes:'',deliveryCalculation:config};
const state={...lib.blank,shipments:[shipment]};const roundtrip=lib.stateSchema.parse(JSON.parse(JSON.stringify(state)));assert.deepEqual(roundtrip.shipments[0].deliveryCalculation,config);assert.deepEqual(lib.wallet(roundtrip),lib.wallet(lib.blank));assert.equal(lib.shipmentSummary(roundtrip,shipment.id).shipping,0);
// Mixed goods currencies keep shipping FX separate and round only after quantity conversion.
const priced={mode:'total',currency:'USD',rateKzt:500,price:600,items:[item(1,{quantity:10,weight:1,weightUnit:'kg',goodsUnitPrice:1000,goodsCurrency:'CNY',goodsRateKzt:71}),item(2,{quantity:20,weight:1,weightUnit:'kg',goodsUnitPrice:200,goodsCurrency:'USD',goodsRateKzt:456}),item(3,{quantity:30,weight:1,weightUnit:'kg',goodsUnitPrice:10000,goodsCurrency:'KZT',goodsRateKzt:1})]};
let mixed=calc(priced);assert.equal(mixed.totalKzt,300000);assert.equal(mixed.goodsTotalKzt,2834000);assert.equal(mixed.landedTotalKzt,3134000);assert.equal(mixed.items[0].goodsUnitKzt,71000);assert.equal(mixed.items[0].goodsKzt,710000);assert.equal(mixed.items[0].landedKzt,760000);assert.equal(mixed.items[0].landedPerUnitKzt,76000);assert.equal(mixed.items[1].landedPerUnitKzt,96200);assert.equal(mixed.items.reduce((n,x)=>n+x.landedKzt,0),mixed.landedTotalKzt);
const tiny=calc({...priced,price:0,items:[item(1,{quantity:1000,goodsUnitPrice:1,goodsCurrency:'CNY',goodsRateKzt:71.1234})]});assert.equal(tiny.goodsTotalKzt,71123);assert.equal(tiny.items[0].landedPerUnitKzt,71.123);
assert.equal(calc({...priced,items:[item(1,{goodsUnitPrice:0,goodsCurrency:'KZT',goodsRateKzt:1})]}).goodsTotalKzt,0);assert.equal(calc({...priced,items:[item(1)]}).landedTotalKzt,null);
for(const bad of [{goodsUnitPrice:100,goodsCurrency:'USD'},{goodsUnitPrice:100,goodsCurrency:'KZT',goodsRateKzt:2},{goodsUnitPrice:1e14,goodsCurrency:'USD',goodsRateKzt:1e8}])assert.throws(()=>calc({...priced,items:[item(1,bad)]}));
assert.deepEqual(lib.deliveryCalculationSchema.parse(JSON.parse(JSON.stringify(priced))),priced);assert.deepEqual(calc(priced),calc(lib.deliveryCalculationSchema.parse(JSON.parse(JSON.stringify(priced)))));
// Actual form state: add, edit, remove a product, save the validated configuration.
let slots=[],cursor=0;const react={...require('react'),useEffect(){},useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]}};
const UI=compile('app/delivery-calculator.tsx',{react,'../lib/ledger':lib,'../lib/delivery-calculator':{calculateDelivery:calc,calculateFullDeliveryCost:fullCost}}).default;
function nodes(n){return !n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]}
let saved;const props={shipment,recordedShippingKzt:0,busy:false,onSave:async c=>(saved=c,true),onBack(){}};const render=()=>{cursor=0;return UI(props)};
let tree=render();assert(nodes(tree).some(n=>n.props?.['aria-label']==='Результат расчёта доставки'));nodes(tree).find(n=>n.props?.['aria-label']==='Вес товара 1').props.onChange({target:{value:'250'}});tree=render();nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(saved.items[0].weight,250);
// Actual form saves the native goods price/currency/rate and shows the stock summary.
slots=[];cursor=0;let priceTree=render();nodes(priceTree).find(n=>n.props?.['aria-label']==='Валюта товара 1').props.onChange({target:{value:'CNY'}});priceTree=render();nodes(priceTree).find(n=>n.props?.['aria-label']==='Цена товара 1').props.onChange({target:{value:'10'}});priceTree=render();assert(nodes(priceTree).find(n=>n.props?.['aria-label']==='Курс товара 1').props.required);nodes(priceTree).find(n=>n.props?.['aria-label']==='Курс товара 1').props.onChange({target:{value:'71'}});priceTree=render();assert(nodes(priceTree).some(n=>n.props?.['aria-label']==='Итоги для МойСклад'));nodes(priceTree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(saved.items[0].goodsUnitPrice,1000);assert.equal(saved.items[0].goodsCurrency,'CNY');assert.equal(saved.items[0].goodsRateKzt,71);assert.equal(saved.items[0].goodsUnitPriceKzt,undefined);
// Editing shipment metadata must preserve saved product weights.
const {ShipmentForm}=(()=>{const source=fs.readFileSync('app/ledger-app.tsx','utf8')+'\nexport {ShipmentForm};';const m={exports:{}};new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(id=>({'react':react,'../lib/ledger':lib,'./shipment-chat':{},'./shipment-ui':{},'./collaboration-ui':{},'./delivery-calculator':{},'./wallets':{},'./shipment-filters':{},'./shipment-files':{},'./suppliers':{}}[id]||(/cargo-products|cargo-cost|procurement-ui/.test(id)?{}:require(id))),m,m.exports);return m.exports})();
slots=[];cursor=0;const native=global.FormData;global.FormData=class{get(k){return ({name:'Изменено',currency:'CNY',total:'100',quantity:'150',unit:'шт.',ordered:'2026-10-21'})[k]||''}};let edited;tree=ShipmentForm({existing:shipment,suppliers:[],busy:false,onSubmit:s=>edited=s});nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){},currentTarget:{}});global.FormData=native;assert.deepEqual(edited.deliveryCalculation,config);
console.log('Delivery calculator: weights, FX, exact allocation, validation, persistence and forms passed');

// Selected shipping modes update complete landed costs, with exact fee allocation.
const complete={...priced,items:priced.items.slice(0,2)};
for(const mode of ['perKg','total','recorded']){
 const delivery=calc({...complete,mode},12345),full=fullCost(delivery,10001);
 assert.equal(full.totalKzt,delivery.goodsTotalKzt+delivery.totalKzt+10001);
 assert.equal(full.items.reduce((n,x)=>n+x.feesKzt,0),10001);
 assert.equal(full.items.reduce((n,x)=>n+x.totalKzt,0),full.totalKzt);
 assert(full.items.every(x=>x.unitCostKzt===x.totalKzt/x.quantity));
}
assert.equal(fullCost(calc(config),100),null);
// Real component rerenders the bottom full-cost block on mode and price changes.
slots=[];props.shipment={...shipment,deliveryCalculation:complete};props.recordedFeesKzt=10001;props.recordedShippingKzt=12345;
const fullText=()=>{const root=nodes(render()).find(x=>x.props?.['aria-label']==='Полная себестоимость груза');return JSON.stringify(root)};
let before=fullText();tree=render();nodes(tree).find(x=>x.props?.['aria-label']==='Способ расчёта доставки').props.onChange({target:{value:'recorded'}});assert.notEqual(fullText(),before);
before=fullText();tree=render();nodes(tree).find(x=>x.props?.['aria-label']==='Способ расчёта доставки').props.onChange({target:{value:'perKg'}});assert.notEqual(fullText(),before);
before=fullText();tree=render();nodes(tree).find(x=>x.props?.['aria-label']==='Тариф или сумма доставки').props.onChange({target:{value:'5'}});assert.notEqual(fullText(),before);
