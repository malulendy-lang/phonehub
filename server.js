const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-this-passwords';
const DB = path.join(__dirname, 'data.json');

app.use(express.json({limit:'1mb'}));

// FIX: Serve static files from the root directory where index.html lives
app.use(express.static(__dirname));

// FIX: Route to explicitly load index.html on root request
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

function load(){ try { return JSON.parse(fs.readFileSync(DB,'utf8')); } catch { return {products:[
 {id:'p1',name:'Nova X Pro',category:'Phones',price:850,description:'Sample product — replace with your own details.',image:'',stock:8},
 {id:'p2',name:'Nova Air',category:'Phones',price:520,description:'Sample product — replace with your own details.',image:'',stock:5},
 {id:'p3',name:'Nova Mini',category:'Phones',price:390,description:'Sample product — replace with your own details.',image:'',stock:4},
 {id:'a1',name:'Fast USB-C Charger',category:'Accessories',price:25,description:'Sample accessory.',image:'',stock:20},
 {id:'a2',name:'Protective Phone Case',category:'Accessories',price:15,description:'Sample accessory.',image:'',stock:30},
 {id:'a3',name:'Wireless Earbuds',category:'Accessories',price:45,description:'Sample accessory.',image:'',stock:12}
 ],orders:[],tickets:[],settings:{deliveryFee:10,pickupLocation:'Pickup details will be confirmed after order.'}}; } }

function save(db){fs.writeFileSync(DB,JSON.stringify(db,null,2));}

function admin(req,res,next){const token=req.get('x-admin-password'); if(!token || token!==ADMIN_PASSWORD) return res.status(401).json({error:'Admin login required.'}); next();}

app.get('/api/products',(req,res)=>{const db=load();res.json(db.products);});
app.get('/api/settings',(req,res)=>{res.json(load().settings);});

app.post('/api/orders',(req,res)=>{const db=load();const {customer,items,fulfillment,address,email,phone}=req.body||{};
 if(!customer||!email||!phone||!Array.isArray(items)||!items.length) return res.status(400).json({error:'Enter your name, email, phone and at least one cart item.'});
 let lines=[],subtotal=0; for(const line of items){const p=db.products.find(x=>x.id===line.id);const qty=Number(line.quantity);if(!p||!Number.isInteger(qty)||qty<1||p.stock<qty) return res.status(400).json({error:'A product is unavailable or quantity is invalid. Refresh and try again.'}); lines.push({id:p.id,name:p.name,price:p.price,quantity:qty,total:p.price*qty});subtotal+=p.price*qty;}
 if(fulfillment!=='pickup'&&fulfillment!=='delivery')return res.status(400).json({error:'Choose delivery or pickup.'});if(fulfillment==='delivery'&&!address)return res.status(400).json({error:'Enter a delivery address.'});
 const fee=fulfillment==='delivery'?Number(db.settings.deliveryFee)||0:0;const order={id:'PH-'+Date.now().toString(36).toUpperCase(),createdAt:new Date().toISOString(),customer,email,phone,items:lines,subtotal,deliveryFee:fee,total:subtotal+fee,fulfillment,address:fulfillment==='delivery'?address:'',status:'Awaiting manual confirmation',paymentStatus:'UNPAID — TEST MODE'};db.orders.unshift(order);save(db);res.json({ok:true,order:{id:order.id,total:order.total,status:order.status,paymentStatus:order.paymentStatus},message:'Test order received. No payment was taken.'});});

app.post('/api/support',(req,res)=>{const db=load();const {name,email,orderId,type,message}=req.body||{};if(!name||!email||!type||!message)return res.status(400).json({error:'Please complete all required support fields.'});const t={id:'SUP-'+Date.now().toString(36).toUpperCase(),createdAt:new Date().toISOString(),name,email,orderId:orderId||'',type,message,status:'Open',adminReply:''};db.tickets.unshift(t);save(db);res.json({ok:true,ticketId:t.id,message:'Your support request was saved for manual review.'});});
app.post('/api/admin/login',(req,res)=>{if((req.body||{}).password!==ADMIN_PASSWORD)return res.status(401).json({error:'Incorrect password.'});res.json({ok:true});});
app.get('/api/admin/data',admin,(req,res)=>{const db=load();res.json({products:db.products,orders:db.orders,tickets:db.tickets,settings:db.settings});});
app.post('/api/admin/products',admin,(req,res)=>{const db=load();const {id,name,category,price,description,image,stock}=req.body||{};if(!name||!Number.isFinite(Number(price))||Number(price)<0)return res.status(400).json({error:'Product name and valid USD price are required.'});const product={id:id||crypto.randomUUID(),name:String(name),category:category||'Phones',price:Number(price),description:description||'',image:image||'',stock:Math.max(0,Number.parseInt(stock||0,10))};const i=db.products.findIndex(p=>p.id===product.id);if(i>=0)db.products[i]=product;else db.products.push(product);save(db);res.json({ok:true,product});});
app.delete('/api/admin/products/:id',admin,(req,res)=>{const db=load();db.products=db.products.filter(p=>p.id!==req.params.id);save(db);res.json({ok:true});});
app.patch('/api/admin/orders/:id',admin,(req,res)=>{const db=load();const o=db.orders.find(x=>x.id===req.params.id);if(!o)return res.status(404).json({error:'Order not found.'});if(req.body.status)o.status=String(req.body.status);save(db);res.json({ok:true,order:o});});
app.patch('/api/admin/tickets/:id',admin,(req,res)=>{const db=load();const t=db.tickets.find(x=>x.id===req.params.id);if(!t)return res.status(404).json({error:'Ticket not found.'});if(req.body.status)t.status=String(req.body.status);if(req.body.adminReply!==undefined)t.adminReply=String(req.body.adminReply);save(db);res.json({ok:true,ticket:t});});
app.patch('/api/admin/settings',admin,(req,res)=>{const db=load();if(req.body.deliveryFee!==undefined){const n=Number(req.body.deliveryFee);if(!Number.isFinite(n)||n<0)return res.status(400).json({error:'Delivery fee must be zero or more.'});db.settings.deliveryFee=n;}if(req.body.pickupLocation!==undefined)db.settings.pickupLocation=String(req.body.pickupLocation);save(db);res.json({ok:true,settings:db.settings});});

app.listen(PORT,()=>console.log(`PhoneHub running at http://localhost:${PORT}`));
