// --- CONFIGURATION ---
const CONFIG = {
    // ⚠️ PASTE YOUR NEW WEB APP URL HERE ⚠️
    API: "https://script.google.com/macros/s/AKfycbycZc3870NSprYvP8FD3Gdf1WdrslxAJTcueKGcaBSM65z61aVwxCzVqz181AhX9eDA/exec",
    
    UPI_ID: "8005737183@ibl",
    UPI_NAME: "BookMyDine",
    STORE_ID: "BMD", 

    RESTAURANT: {
        NAME: "BookMyDine Restaurant",
        ADDRESS: "123 Food Street, Mumbai, Maharashtra 400001",
        PHONE: "+91 80057 37183",
        LOGO: "logo_withoutbackground.png"
    },

    DEFAULT_MENU: [
        { id: 101, name: "Paneer Butter Masala", price: 240, category: "Main" },
        { id: 102, name: "Dal Makhani", price: 180, category: "Main" },
        { id: 103, name: "Butter Naan", price: 45, category: "Breads" },
        { id: 104, name: "Tandoori Roti", price: 30, category: "Breads" },
        { id: 105, name: "Veg Biryani", price: 200, category: "Rice" },
        { id: 106, name: "Jeera Rice", price: 140, category: "Rice" },
        { id: 107, name: "Masala Papad", price: 40, category: "Starters" },
        { id: 108, name: "Fresh Lime Soda", price: 60, category: "Drinks" },
        { id: 109, name: "Mineral Water", price: 20, category: "Drinks" }
    ],
    TABLES_COUNT: 12,
    TAX_RATE: 0.05,
    GSTIN: "29AAAAA0000A1Z5"
};

const app = {
    state: {
        waiter: null, table: null, cart: {}, menu: CONFIG.DEFAULT_MENU,
        serverTables: {}, totals: { sub:0, discPer:0, discAmt:0, tax:0, total:0 },
        payMode: null, originalWaiterName: null, billNo: null
    },

    init: () => {
        const saved = localStorage.getItem('pos_waiter');
        if(saved) {
            app.state.waiter = JSON.parse(saved);
            app.nav('screen-tables');
            app.syncData();
            app.startPolling();
        } else {
            app.nav('screen-login');
        }
    },

    generateNextBillNo: () => {
        const now = new Date();
        const todayStr = now.toISOString().slice(0,10).replace(/-/g,''); 
        const savedDate = localStorage.getItem('pos_last_date');
        let seq = Number(localStorage.getItem('pos_daily_seq')) || 0;
        
        if (savedDate !== todayStr) { 
            seq = 1; 
            localStorage.setItem('pos_last_date', todayStr); 
        } else { 
            seq++; 
        }
        localStorage.setItem('pos_daily_seq', seq);
        return `${CONFIG.STORE_ID}-${todayStr}-${String(seq).padStart(4, '0')}`;
    },

    nav: (screenId) => {
        document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
        
        const isHome = (screenId === 'screen-login' || screenId === 'screen-tables');
        document.getElementById('nav-back').classList.toggle('invisible', isHome);
        document.getElementById('nav-logout').classList.toggle('invisible', screenId === 'screen-login');

        if(screenId === 'screen-tables') app.renderTables();
        if(screenId === 'screen-menu') app.renderMenu();
        if(screenId === 'screen-review') app.renderReview();
        app.updateFooter(screenId);
    },

    back: () => {
        const current = document.querySelector('.screen.active').id;
        const map = {
            'screen-menu': 'screen-tables', 'screen-review': 'screen-menu',
            'screen-payment': 'screen-review', 'screen-action': 'screen-payment',
            'screen-bill': 'screen-tables'
        };
        if(map[current]) app.nav(map[current]);
    },

    updateFooter: (screen) => {
        const footer = document.getElementById('app-footer');
        footer.classList.remove('hidden');
        footer.innerHTML = '';

        if(screen === 'screen-menu') {
            const total = app.calcCartTotal();
            const count = Object.keys(app.state.cart).length;
            
            if(total > 0) {
                footer.innerHTML = `
                    <div class="floating-cart" onclick="app.nav('screen-review')">
                        <div class="fc-info">
                            <span class="fc-count">${count} ITEM${count > 1 ? 'S' : ''} ADDED</span>
                            <span class="fc-total">₹${total}</span>
                        </div>
                        <div class="fc-action">
                            View Cart <span style="font-size:20px">→</span>
                        </div>
                    </div>`;
            } else {
                footer.classList.add('hidden');
            }
        } 
        else if (screen === 'screen-review') {
            footer.innerHTML = `
                <button class="btn-checkout" onclick="app.nav('screen-payment')">
                    Proceed to Pay
                </button>`;
        } 
        else {
            footer.classList.add('hidden');
        }
    },

    login: (offline = false) => {
        if(offline) { app.setWaiter({id:'OFF', name:'Offline User'}); return; }
        const id = document.getElementById('login-id').value;
        const pass = document.getElementById('login-pass').value;
        if(!id || !pass) return alert("Enter credentials");

        document.getElementById('server-status').innerText = "Verifying...";
        fetch(`${CONFIG.API}?action=login`, { method: 'POST', body: JSON.stringify({id, password:pass}) })
        .then(r => r.json()).then(d => {
            if(d.success) app.setWaiter({id, name:d.name}); else alert("Invalid Login");
        }).catch(() => {
            if(confirm("Server Error. Login Offline?")) app.setWaiter({id:'OFF', name:'Offline User'});
        });
    },

    setWaiter: (w) => {
        app.state.waiter = w;
        localStorage.setItem('pos_waiter', JSON.stringify(w));
        app.nav('screen-tables');
        app.syncData();
        app.startPolling();
    },

    logout: () => { localStorage.clear(); location.reload(); },

    syncData: () => {
        fetch(`${CONFIG.API}?action=getMenu`).then(r=>r.json()).then(d=>{if(d.success)app.state.menu=d.data});
        fetch(`${CONFIG.API}?action=getTables`).then(r=>r.json()).then(d=>{if(d.success)app.state.serverTables=d.data});
    },

    startPolling: () => {
        setInterval(() => {
            if(document.hidden) return;
            fetch(`${CONFIG.API}?action=getTables`).then(r=>r.json()).then(d => {
                if(d.success) {
                    app.state.serverTables = d.data;
                    document.getElementById('sync-status').innerText = "● Online";
                    document.getElementById('sync-status').style.color = "green";
                    if(document.getElementById('screen-tables').classList.contains('active')) app.renderTables();
                }
            }).catch(()=> {
                document.getElementById('sync-status').innerText = "○ Offline";
                document.getElementById('sync-status').style.color = "gray";
            });
        }, 5000);
    },

    renderTables: () => {
        document.getElementById('staff-display').innerText = `Staff: ${app.state.waiter.name}`;
        const container = document.getElementById('tables-container');
        container.innerHTML = '';
        for(let i=1; i<=CONFIG.TABLES_COUNT; i++) {
            const div = document.createElement('div');
            div.className = 'card';
            div.innerHTML = `<h3>Table ${i}</h3>`;
            const serverData = app.state.serverTables[i];
            const isOccupied = serverData && (serverData.status === 'occupied' || (serverData.cart && Object.keys(serverData.cart).length > 0));
            if(isOccupied) {
                div.classList.add('occupied');
                div.innerHTML += `<div class="amt">Busy (${serverData.waiter || '..'})</div>`;
            } else {
                div.innerHTML += `<div class="amt">Free</div>`;
            }
            div.onclick = () => app.openTable(i, serverData);
            container.appendChild(div);
        }
    },

    openTable: (id, serverData) => {
        app.state.table = id;
        document.getElementById('menu-table-title').innerText = `Table ${id}`;
        if(serverData && serverData.cart) {
            app.state.cart = serverData.cart;
            app.state.originalWaiterName = serverData.waiter || app.state.waiter.name;
        } else {
            app.state.cart = {};
            app.state.originalWaiterName = app.state.waiter.name;
        }
        app.nav('screen-menu');
    },

    renderMenu: () => {
        const list = document.getElementById('menu-container');
        list.innerHTML = '';
        app.state.menu.forEach(item => {
            const qty = app.state.cart[item.id] || 0;
            const div = document.createElement('div');
            div.className = 'menu-item';
            
            div.innerHTML = `
                <div class="item-left">
                    <div class="veg-icon"><div class="veg-dot"></div></div>
                    <div class="item-info">
                        <h4>${item.name}</h4>
                        <span class="item-price">₹${item.price}</span>
                        <div class="item-desc">${item.category}</div>
                    </div>
                </div>
                <div class="qty-control">
                    <button class="qty-btn" onclick="app.modQty(${item.id}, -1)">−</button>
                    <span class="qty-text">${qty > 0 ? qty : '0'}</span>
                    <button class="qty-btn" onclick="app.modQty(${item.id}, 1)">+</button>
                </div>`;
            list.appendChild(div);
        });
        app.updateFooter('screen-menu');
    },

    modQty: (id, diff) => {
        if(!app.state.cart[id]) app.state.cart[id] = 0;
        app.state.cart[id] += diff;
        if(app.state.cart[id] <= 0) delete app.state.cart[id];
        
        app.renderMenu(); 

        fetch(`${CONFIG.API}?action=updateTable`, {
            method: 'POST', body: JSON.stringify({
                tableId: app.state.table, cart: app.state.cart, waiter: app.state.originalWaiterName
            })
        });
    },

    calcCartTotal: () => {
        let total = 0;
        for(let id in app.state.cart) {
            const item = app.state.menu.find(i => i.id == id);
            if(item) total += item.price * app.state.cart[id];
        }
        return total;
    },

    renderReview: () => {
        const container = document.getElementById('review-items');
        let html = '';
        for(let id in app.state.cart) {
            const item = app.state.menu.find(i => i.id == id);
            if(item) {
                html += `
                <div style="display:flex; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid #eee; padding-bottom:8px;">
                    <div>
                        <div style="font-weight:600;">${item.name}</div>
                        <div style="font-size:12px; color:#666;">${app.state.cart[id]} x ₹${item.price}</div>
                    </div>
                    <div style="font-weight:600;">₹${item.price * app.state.cart[id]}</div>
                </div>`;
            }
        }
        container.innerHTML = html || '<p style="text-align:center; color:#888;">Cart is empty</p>';
        app.calcTotals();
    },

    calcTotals: () => {
        const sub = app.calcCartTotal();
        const discPer = Number(document.getElementById('discount-val').value) || 0;
        const discAmt = Number((sub * (discPer/100)).toFixed(2));
        const taxable = sub - discAmt;
        const taxTotal = Number((taxable * CONFIG.TAX_RATE).toFixed(2));
        const total = Math.round(taxable + taxTotal);
        
        app.state.totals = { sub, discPer, discAmt, tax: taxTotal, total };
        
        if(document.getElementById('summ-sub')) {
            document.getElementById('menu-cart-total').innerText = `₹${total}`;
            document.getElementById('summ-sub').innerText = `₹${sub}`;
            document.getElementById('summ-disc').innerText = `-₹${discAmt}`;
            document.getElementById('summ-tax').innerText = `₹${taxTotal}`;
            document.getElementById('summ-total').innerText = `₹${total}`;
            document.getElementById('pay-amount').innerText = `₹${total}`;
        }
        app.updateFooter('screen-review');
    },

    setPayment: (mode) => {
        app.state.payMode = mode;
        app.calcTotals();
        
        document.getElementById('action-upi').classList.add('hidden');
        document.getElementById('action-cash').classList.add('hidden');
        document.getElementById('action-card').classList.add('hidden');
        const total = app.state.totals.total;

        if(mode === 'UPI') {
            document.getElementById('action-upi').classList.remove('hidden');
            const url = `upi://pay?pa=${CONFIG.UPI_ID}&pn=${encodeURIComponent(CONFIG.UPI_NAME)}&am=${total}&tr=${Date.now()}`;
            new QRious({ element: document.getElementById('qr-code'), value: url, size: 200 });
            document.getElementById('qr-amount-text').innerText = `₹${total}`;
        } 
        else if (mode === 'CASH') {
            document.getElementById('action-cash').classList.remove('hidden');
            document.getElementById('cash-bill-amt').innerText = `₹${total}`;
            document.getElementById('cash-in').value = '';
            document.getElementById('cash-change').innerText = '₹0';
        }
        else if (mode === 'CARD') {
            document.getElementById('action-card').classList.remove('hidden');
            document.getElementById('card-amount-text').innerText = `₹${total}`;
        }
        app.nav('screen-action');
    },

    calcChange: () => {
        const received = Number(document.getElementById('cash-in').value) || 0;
        const change = received - app.state.totals.total;
        const el = document.getElementById('cash-change');
        el.innerText = change >= 0 ? `₹${change}` : `Pending: ₹${Math.abs(change)}`;
        el.style.color = change >= 0 ? 'green' : 'red';
    },

    confirmPay: () => {
        if(app.state.payMode === 'CASH') {
            const received = Number(document.getElementById('cash-in').value) || 0;
            if(received < app.state.totals.total) return alert("Amount insufficient");
        }

        app.state.billNo = app.generateNextBillNo();
        
        let itemsHtml = '';
        for(let id in app.state.cart) {
            const item = app.state.menu.find(i => i.id == id);
            itemsHtml += `
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <div style="flex:2;">${item.name}<br><small>${app.state.cart[id]} x ₹${item.price}</small></div>
                <div style="flex:1; text-align:right;">₹${item.price * app.state.cart[id]}</div>
            </div>`;
        }

        const dateStr = new Date().toLocaleDateString('en-IN');
        const timeStr = new Date().toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'});

        document.getElementById('receipt-view').innerHTML = `
            <div class="receipt-header">
                <img src="${CONFIG.RESTAURANT.LOGO}" class="receipt-logo">
                <div class="receipt-bold" style="font-size:16px;">${CONFIG.RESTAURANT.NAME}</div>
                <div>${CONFIG.RESTAURANT.ADDRESS}</div>
                <div>Ph: ${CONFIG.RESTAURANT.PHONE}</div>
                <div>GSTIN: ${CONFIG.GSTIN}</div>
            </div>
            <div class="receipt-divider"></div>
            <div class="receipt-row"><span>Bill No: ${app.state.billNo}</span><span>${dateStr}</span></div>
            <div class="receipt-row"><span>Table: ${app.state.table}</span><span>Time: ${timeStr}</span></div>
            <div class="receipt-row"><span>Waiter: ${app.state.originalWaiterName}</span></div>
            <div class="receipt-divider"></div>
            ${itemsHtml}
            <div class="receipt-divider"></div>
            <div class="receipt-row"><span>Subtotal</span><span>₹${app.state.totals.sub.toFixed(2)}</span></div>
            ${app.state.totals.discAmt > 0 ? `<div class="receipt-row"><span>Discount</span><span>-${app.state.totals.discAmt}</span></div>` : ''}
            <div class="receipt-row"><span>Tax (5%)</span><span>₹${app.state.totals.tax.toFixed(2)}</span></div>
            <div class="receipt-divider"></div>
            <div class="receipt-row receipt-bold" style="font-size:18px;"><span>GRAND TOTAL</span><span>₹${app.state.totals.total.toFixed(2)}</span></div>
            <div style="text-align:center; margin-top:10px;">Mode: ${app.state.payMode}</div>
            <div style="text-align:center; margin-top:5px; font-size:10px;">Thank You! Visit Again.</div>
        `;
        
        app.nav('screen-bill');

        fetch(`${CONFIG.API}?action=checkout`, {
            method: 'POST',
            body: JSON.stringify({
                billNo: app.state.billNo, tableId: app.state.table, 
                waiter: app.state.originalWaiterName,
                paymentMethod: app.state.payMode, items: app.state.cart,
                subtotal: app.state.totals.sub,
                discount: app.state.totals.discAmt,
                tax: app.state.totals.tax,
                total: app.state.totals.total,
                customerName: "Guest", customerMobile: "", customerEmail: ""
            })
        }).catch(err => console.error("Sync error:", err));
    },

    openShare: () => {
        document.getElementById('share-form').style.display = 'block';
        document.getElementById('share-success').classList.add('hidden');
        document.getElementById('share-name').value = '';
        document.getElementById('share-mobile').value = '';
        document.getElementById('share-email').value = '';
        document.getElementById('modal-share').style.display = 'flex';
    },
    
    // --- UPDATED SENDSHARE FUNCTION ---
    sendShare: (btn) => {
        const name = document.getElementById('share-name').value.trim();
        const mobile = document.getElementById('share-mobile').value.trim();
        const email = document.getElementById('share-email').value.trim();
        const billNo = app.state.billNo;
        
        if(!name || (!mobile && !email)) return alert("Enter Name and Mobile/Email");
        
        btn.innerText = "Sending...";
        btn.disabled = true;

        // Prepare Item List for Backend (PDF)
        let itemsList = [];
        for(let id in app.state.cart) {
            const item = app.state.menu.find(i => i.id == id);
            if(item) {
                itemsList.push({
                    name: item.name, 
                    qty: app.state.cart[id], 
                    total: item.price * app.state.cart[id]
                });
            }
        }

        // WhatsApp Logic - Custom Template
        if(mobile) {
            const dateStr = new Date().toLocaleDateString('en-IN');
            const timeStr = new Date().toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit', hour12: true});
            const taxSplit = (app.state.totals.tax / 2).toFixed(2);
            const waiterName = app.state.originalWaiterName || "Staff";

            let msg = `Hello ${name}!  \n\n`;
            msg += `  ${CONFIG.RESTAURANT.NAME}\n`;
            msg += `${CONFIG.RESTAURANT.ADDRESS}\n`;
            msg += `Phone: ${CONFIG.RESTAURANT.PHONE}\n`;
            msg += `GSTIN: ${CONFIG.GSTIN}\n\n`;
            msg += `━━━━━━━━━━━━━━━━━━━━\n`;
            msg += `  Bill No: ${billNo}\n`;
            msg += `  Date: ${dateStr}\n`;
            msg += `  Time: ${timeStr}\n`;
            msg += `  Table: ${app.state.table}\n`;
            msg += `  Waiter: ${waiterName}\n`;
            msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
            msg += `ITEMS ORDERED:\n`;

            itemsList.forEach(i => {
                msg += `• ${i.name} ${i.qty} x ₹${(i.total/i.qty)} = ₹${i.total}\n`;
            });

            msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
            msg += `Subtotal: ₹${app.state.totals.sub.toFixed(2)}\n`;
            
            if(app.state.totals.discAmt > 0) {
                 msg += `Discount: -₹${app.state.totals.discAmt}\n`;
            }

            msg += `CGST (2.5%): ₹${taxSplit}\n`;
            msg += `SGST (2.5%): ₹${taxSplit}\n`;
            msg += `━━━━━━━━━━━━━━━━━━━━\n`;
            msg += `GRAND TOTAL: ₹${app.state.totals.total.toFixed(2)}\n\n`;
            msg += `  Paid via: ${app.state.payMode}\n\n`;
            msg += `Thank you for dining with us!  \n`;
            msg += `Please visit again!`;

            setTimeout(() => {
                window.open(`https://wa.me/91${mobile}?text=${encodeURIComponent(msg)}`, '_blank');
            }, 300);
        }

        // Email Logic
        if(email) {
            fetch(`${CONFIG.API}?action=sendBill`, {
                method: 'POST', 
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    billNo: billNo,
                    customerName: name,
                    customerMobile: mobile,
                    customerEmail: email,
                    restaurantName: CONFIG.RESTAURANT.NAME,
                    total: app.state.totals.total,
                    itemsList: itemsList 
                })
            }).then(() => console.log("Data sent to server"));
        }

        setTimeout(() => {
            document.getElementById('share-form').style.display = 'none';
            document.getElementById('share-success').classList.remove('hidden');
            btn.innerText = "Send";
            btn.disabled = false;
            app.state.cart = {}; 
        }, 1000); 
    },

    printSuccess: () => {
        document.getElementById('modal-share').style.display = 'none'; 
        window.print();
    },

    resetOrder: () => {
        app.state.cart = {};
        app.state.totals = { sub:0, disc:0, tax:0, total:0 };
        document.getElementById('discount-val').value = '';
        app.nav('screen-tables');
    }
};

window.onload = app.init;