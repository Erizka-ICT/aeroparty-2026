let selectedClass=null, selectedStep=null, pollTimer=null;
const POSITION_LABELS=[
  'A1','A2','A3','A4','A5','A6',
  'B1','B2','B3','B4','B5','B6','B7',
  'C1','C2','C3','C4','C5','C6',
  'D1','D2','D3','D4','D5','D6','D7',
  'E1','E2','E3','E4','E5','E6',
  'F1','F2','F3','F4','F5','F6','F7',
  'G1','G2','G3','G4','G5','G6',
  'H1','H2','H3','H4','H5'
];
const POSITION_ROW_SIZES=[6,7,6,7,6,7,6,5];
const stepLabel=n=>POSITION_LABELS[Number(n)-1]||String(n);
const $=s=>document.querySelector(s);
const money=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n));
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
async function api(url,opts){const r=await fetch(url,opts);const d=await r.json();if(!r.ok)throw new Error(d.error||'Something went wrong');return d}
function scrollToSection(id){document.getElementById(id).scrollIntoView({behavior:'smooth'})}
async function loadClasses(){const data=await api('/api/classes');$('#classGrid').innerHTML=data.map((c,i)=>`<article class="class-card" onclick="chooseClass('${c.slug}')"><span class="number">0${i+1}</span><h3>${esc(c.name)}</h3><p>${esc(c.description)}</p><div class="availability"><b>${c.available}</b> of ${c.total} positions available</div></article>`).join('')}
async function chooseClass(slug){selectedClass=slug;selectedStep=null;const [classes,steps]=await Promise.all([api('/api/classes'),api(`/api/classes/${slug}/steps`)]);const c=classes.find(x=>x.slug===slug);$('#selectedClassTitle').textContent=c.name;renderSteps(steps.steps);$('#positions').classList.remove('hidden');$('#selectedBar').classList.add('hidden');scrollToSection('positions')}
function renderSteps(steps){
  const byNumber=new Map(steps.map(s=>[Number(s.step_number),s]));
  let number=1;
  $('#stepGrid').innerHTML=POSITION_ROW_SIZES.map((count,rowIndex)=>{
    const row=Array.from({length:count},()=>{
      const s=byNumber.get(number);
      const html=`<button class="step ${s.status}" ${s.status!=='available'?'disabled':''} aria-label="Posisi ${stepLabel(number)}" title="${stepLabel(number)}" onclick="selectStep(${number},this)">${stepLabel(number)}</button>`;
      number++;
      return html;
    }).join('');
    return `<div class="step-row row-${rowIndex+1}">${row}</div>`;
  }).join('');
}
function selectStep(n,el){document.querySelectorAll('.step.selected').forEach(x=>x.classList.remove('selected'));el.classList.add('selected');selectedStep=n;$('#selectedNumber').textContent=stepLabel(n);$('#selectedBar').classList.remove('hidden')}
function openDetails(){if(!selectedClass||!selectedStep)return;$('#modalContent').innerHTML=`<div class="eyebrow">STEP 03</div><h3>Data peserta</h3><div class="sub">Isi data dengan benar untuk melanjutkan pemesanan.</div><div class="pay-summary"><div><small>Kelas</small><strong>${esc(selectedClass)}</strong></div><div><small>Posisi</small><strong>${stepLabel(selectedStep)}</strong></div></div><form class="form-grid" onsubmit="createBooking(event)"><div class="field"><label>Nama lengkap</label><input name="fullName" required maxlength="120"></div><div class="field"><label>WhatsApp</label><input name="phone" required maxlength="40"></div><div class="field"><label>Email</label><input type="email" name="email" required maxlength="180"></div><button class="gold-btn full">Lanjut pembayaran →</button></form>`;$('#modal').classList.remove('hidden')}
async function createBooking(e){e.preventDefault();const f=new FormData(e.target),payload={classSlug:selectedClass,stepNumber:selectedStep,fullName:f.get('fullName'),phone:f.get('phone'),email:f.get('email')};const btn=e.target.querySelector('button');btn.disabled=true;try{const b=await api('/api/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});showPayment(b)}catch(err){btn.disabled=false;toast(err.message)}}
function showPayment(b){$('#modalContent').innerHTML=`<div class="eyebrow">PEMBAYARAN</div><h3>Transfer dan unggah bukti</h3><p class="sub">Nomor posisi akan dikunci setelah admin memeriksa pembayaran.</p><div class="pay-summary"><div><small>Order ID</small><strong>${esc(b.orderId)}</strong></div><div><small>Total transfer</small><strong>${money(b.amount)}</strong></div></div><div class="va-box"><div class="va-bank">TRANSFER BANK BCA</div><div style="font-size:25px;font-weight:800;margin:12px 0">4372508161</div><div>Atas nama <b>Cita Amadhea</b></div><button class="copy-btn" onclick="navigator.clipboard.writeText('4372508161');toast('Nomor rekening disalin')">Salin rekening</button></div><form class="form-grid" onsubmit="uploadProof(event,'${esc(b.orderId)}')"><div class="field"><label>Upload bukti transfer (JPG/PNG/WEBP/PDF, maks. 4 MB)</label><input type="file" name="proof" accept="image/jpeg,image/png,image/webp,application/pdf" required></div><button class="gold-btn full">Kirim bukti transfer</button></form><p class="muted" style="font-size:12px">Simpan Order ID: ${esc(b.orderId)} untuk mengecek status pemesanan.</p><button class="copy-btn" onclick="checkBooking('${esc(b.orderId)}')">Cek status</button>`}
async function uploadProof(e,order){e.preventDefault();const file=e.target.proof.files[0];if(!file)return;if(file.size>4*1024*1024){toast('Ukuran file maksimal 4 MB');return}const btn=e.target.querySelector('button');btn.disabled=true;try{const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(file)});await api(`/api/bookings/${order}/proof`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data,mime:file.type})});$('#modalContent').innerHTML=`<div class="success-icon">✓</div><h3>Bukti berhasil dikirim</h3><p class="sub">Admin akan memeriksa transfer. Simpan Order ID berikut untuk mengecek hasilnya.</p><div class="pay-summary"><div><small>Order ID</small><strong>${esc(order)}</strong></div><div><small>Status</small><strong>Menunggu verifikasi</strong></div></div><button class="gold-btn full" onclick="checkBooking('${esc(order)}')">Cek status</button>`;startPolling(order)}catch(err){btn.disabled=false;toast(err.message)}}
async function checkBooking(order){try{const b=await api(`/api/bookings/${order}`);if(b.status==='paid'||b.status==='rejected')showResult(b);else toast('Status: menunggu verifikasi admin.')}catch(e){toast(e.message)}}
function startPolling(order){clearInterval(pollTimer);pollTimer=setInterval(async()=>{try{const b=await api(`/api/bookings/${order}`);if(b.status==='paid'||b.status==='rejected'){clearInterval(pollTimer);showResult(b)}}catch(e){}},7000)}
function showResult(b){if(b.status==='paid'){$('#modalContent').innerHTML=`<div class="success-icon">✓</div><div class="eyebrow">BOOKING DIKONFIRMASI</div><h3>Posisi berhasil dikunci.</h3><div class="receipt" id="receipt"><div style="text-align:center;font-family:Cinzel,serif;color:#9d752c">AEROPARTY 2026</div><div class="receipt-step">${stepLabel(b.step_number)}</div><div class="receipt-row"><span>Peserta</span><b>${esc(b.full_name)}</b></div><div class="receipt-row"><span>Kelas</span><b>${esc(b.class_name)}</b></div><div class="receipt-row"><span>Order ID</span><b>${esc(b.order_id)}</b></div><div class="receipt-row"><span>Status</span><b>PAID</b></div></div><button class="gold-btn full" onclick="window.print()">Print / Save PDF</button>`}else if(b.status==='rejected'){$('#modalContent').innerHTML=`<h3>Bukti perlu diperbaiki</h3><p class="sub">Pembayaran belum disetujui admin. Silakan hubungi panitia dengan Order ID ${esc(b.order_id)}.</p>`}}
function closeModal(){clearInterval(pollTimer);$('#modal').classList.add('hidden')}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500)}
loadClasses().catch(e=>toast(e.message));
