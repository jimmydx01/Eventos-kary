const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const STORAGE_KEY = 'fiestas-v2';
const today = () => new Date().toISOString().slice(0, 10);
const formatDate = (date) => date ? date.split('-').reverse().join('/') : 'sin fecha';

const PUB = JSON.parse($('#pubdata').textContent);
let DB;
let D = { items: [] };
let dirty = 0;

try {
  DB = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
} catch (error) {
  DB = {};
}

DB.prods = DB.prods || [];
DB.events = DB.events || [];
DB.loans = DB.loans || [];

const save = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
  } catch (error) {
    toast('No se pudo guardar: la memoria del navegador está llena. Usa fotos más pequeñas o elimina algunas.');
  }
};

const isAdmin = () => sessionStorage.getItem('adm') === '1';
let V = sessionStorage.getItem('v') || 'pub';
if (!['pub', 'inv', 'ev', 'loan', 'srv', 'rep'].includes(V) || (V !== 'pub' && !isAdmin())) V = 'pub';

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    element.hidden = true;
  }, 4500);
}

async function copyServiceLink(index) {
  const link = new URL(window.location.href);
  link.searchParams.set('servicio', index);

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(link.href);
    } else {
      const field = document.createElement('textarea');
      field.value = link.href;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      const copied = document.execCommand('copy');
      field.remove();
      if (!copied) throw new Error('clipboard unavailable');
    }
    toast('Enlace del servicio copiado.');
  } catch (error) {
    toast('No se pudo copiar el enlace en este navegador.');
  }
}

const shrinkImage = (file, maxSize = 640) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.72));
    };
    image.onerror = () => resolve('');
    image.src = reader.result;
  };
  reader.onerror = () => resolve('');
  reader.readAsDataURL(file);
});

const productById = (id) => DB.prods.find((product) => product.id == id);
const eventQuantity = (id) => DB.events
  .filter((event) => event.st !== 'ret')
  .reduce((total, event) => total + event.items
    .filter((item) => item.p == id)
    .reduce((subtotal, item) => subtotal + item.q, 0), 0);
const loanQuantity = (id) => DB.loans
  .filter((loan) => !loan.b && loan.p == id)
  .reduce((total, loan) => total + loan.q, 0);
const availableQuantity = (product) => product.q - eventQuantity(product.id) - loanQuantity(product.id);

function go(view) {
  V = view;
  sessionStorage.setItem('v', view);
  D = { items: [] };
  render();
  scrollTo(0, 0);
}

function render() {
  $('#app').innerHTML = V === 'pub' ? window.renderPublicPage(PUB, esc) : adminView();
  const sharedService = new URLSearchParams(window.location.search).get('servicio');
  if (V === 'pub' && sharedService !== null && /^\d+$/.test(sharedService) && PUB.sv[Number(sharedService)]) {
    requestAnimationFrame(() => document.querySelector(`#servicio-${sharedService}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }
}

function adminView() {
  const tabs = [['inv', 'Inventario'], ['ev', 'Eventos'], ['loan', 'Préstamos'], ['srv', 'Servicios y contacto'], ['rep', 'Informes']];
  return `<div class="bar"><b>EVENTOS D'KARY <span class="demo-badge">DEMO</span></b><span><button class="btn" data-a="go" data-i="pub">Ver página pública</button> <button class="btn" data-a="logout">Salir del demo</button></span></div>
<div class="wrap"><p class="demo-notice"><b>Modo demostración:</b> no hay usuario ni contraseña. Los datos se guardan únicamente en este navegador; este panel no protege información real.</p></div>
<main class="wrap"><nav class="tabs">${tabs.map((tab) => `<button class="tab ${V === tab[0] ? 'on' : ''}" data-a="go" data-i="${tab[0]}">${tab[1]}</button>`).join('')}</nav>
${V === 'inv' ? inventoryView() : V === 'ev' ? eventsView() : V === 'loan' ? loansView() : V === 'srv' ? servicesView() : reportsView()}</main>`;
}

function inventoryView() {
  const unavailable = DB.prods.filter((product) => availableQuantity(product) <= 0);
  const assignedTo = (product) => DB.events
    .filter((event) => event.st !== 'ret')
    .flatMap((event) => event.items
      .filter((item) => item.p == product.id)
      .map((item) => `<span class="chip rent">Alquilado: ${esc(event.cl)} ×${item.q}</span>`))
    .concat(DB.loans
      .filter((loan) => !loan.b && loan.p == product.id)
      .map((loan) => `<span class="chip low">Prestado: ${esc(loan.who)} ×${loan.q}</span>`))
    .join('');

  return `${unavailable.length ? `<div class="card" style="border-color:var(--warn)"><b style="color:var(--warn)">Sin unidades en bodega:</b> ${unavailable.map((product) => esc(product.n)).join(', ')}</div>` : ''}
<h2>Agregar producto</h2><div class="card"><div class="f">
<div><label>Nombre</label><input data-d="pn" value="${esc(D.pn)}" placeholder="Silla Tiffany blanca"></div>
<div><label>Categoría</label><input data-d="pc" value="${esc(D.pc)}" placeholder="Sillas"></div>
<div><label>Cantidad total</label><input type="number" min="1" data-d="pq" value="${esc(D.pq ?? 1)}"></div>
<div><label>Foto</label><input type="file" accept="image/*" data-f="p"></div>
${D.img ? `<img class="th" src="${esc(D.img)}" alt="Vista previa">` : ''}
<button class="btn p" data-a="addp">Agregar producto</button></div></div>
<h2>Productos</h2><div class="card tbl"><table><thead><tr><th></th><th>Producto</th><th>Total</th><th>En bodega</th><th>Estado</th><th>¿Con quién está?</th><th>Ajustar</th></tr></thead><tbody>
${DB.prods.map((product) => {
    const available = availableQuantity(product);
    return `<tr><td>${product.img ? `<img class="th" src="${esc(product.img)}" alt="">` : '<div class="th"></div>'}</td><td><b>${esc(product.n)}</b><div class="mut">${esc(product.c)}</div></td><td>${product.q}</td><td><b>${available}</b></td>
<td>${available > 0 ? '<span class="chip ok">Disponible</span>' : '<span class="chip bad">No disponible</span>'}</td><td>${assignedTo(product) || '<span class="mut">En bodega</span>'}</td>
<td><button class="btn" data-a="pdec" data-i="${product.id}" aria-label="Restar una unidad">−</button> <button class="btn" data-a="pinc" data-i="${product.id}" aria-label="Sumar una unidad">+</button> <button class="btn d" data-a="pdel" data-i="${product.id}">Eliminar</button></td></tr>`;
  }).join('') || '<tr><td colspan="7" class="mut">Aún no hay productos. Agrega el primero arriba.</td></tr>'}</tbody></table></div>`;
}

function eventCard(event) {
  const chips = event.items
    .map((item) => `<span class="chip rent">${esc(productById(item.p)?.n || 'Producto eliminado')} ×${item.q}</span>`)
    .join('');
  const buttons = event.st === 'pend'
    ? `<button class="btn g" data-a="edone" data-i="${event.id}">Marcar realizado</button> <button class="btn d" data-a="edel" data-i="${event.id}">Cancelar</button>`
    : event.st === 'done'
      ? `<button class="btn g" data-a="eback" data-i="${event.id}">Marcar retirado</button>`
      : '';

  return `<article class="card ev"><div><b>${esc(event.n)}</b>${event.st === 'pend' && event.d && event.d < today() ? ' <span class="chip low">Fecha ya pasó</span>' : ''}<div class="mut">Cliente: ${esc(event.cl)}</div><div class="mut">Fecha: ${formatDate(event.d)}${event.pl ? `. Lugar: ${esc(event.pl)}` : ''}</div><div>${chips}</div></div><div>${buttons}</div></article>`;
}

function eventsView() {
  const sortEvents = (status, ascending) => DB.events
    .filter((event) => event.st === status)
    .sort((first, second) => ascending
      ? (first.d || '9').localeCompare(second.d || '9')
      : (second.d || '').localeCompare(first.d || ''));
  const selectedProduct = D.ip || DB.prods[0]?.id;
  const product = productById(selectedProduct);
  const used = D.items.filter((item) => item.p == selectedProduct).reduce((total, item) => total + item.q, 0);
  const section = (title, events, emptyMessage) => `<h2>${title} (${events.length})</h2>${events.map(eventCard).join('') || `<p class="mut">${emptyMessage}</p>`}`;

  return `<h2 style="margin-top:0">Nuevo evento</h2><div class="card"><div class="f">
<div><label>Cliente</label><input data-d="cl" value="${esc(D.cl)}"></div><div><label>Evento</label><input data-d="en" value="${esc(D.en)}" placeholder="Boda, cumpleaños..."></div>
<div><label>Fecha</label><input type="date" data-d="ed" value="${esc(D.ed)}"></div><div><label>Lugar</label><input data-d="ep" value="${esc(D.ep)}"></div></div>
<h3 style="margin:1rem 0 .5rem">Productos del evento</h3><div class="f"><div><label>Producto</label><select data-d="ip">${DB.prods.map((item) => `<option value="${item.id}" ${item.id == selectedProduct ? 'selected' : ''}>${esc(item.n)}</option>`).join('')}</select></div>
<div><label>Cantidad${product ? ` (quedan ${availableQuantity(product) - used})` : ''}</label><input type="number" min="1" data-d="iq" value="${esc(D.iq ?? 1)}"></div><button class="btn" data-a="ei">Agregar a la lista</button></div>
<div style="margin:.6rem 0">${D.items.map((item, index) => `<span class="chip rent">${esc(productById(item.p)?.n)} ×${item.q} <button class="lnk" data-a="er" data-i="${index}" aria-label="Quitar">quitar</button></span>`).join('') || '<span class="mut">Todavía no agregaste productos.</span>'}</div>
<button class="btn p" data-a="es">Guardar evento</button></div>
${section('Pendientes', sortEvents('pend', true), 'No hay eventos pendientes.')}${section('Por retirar', sortEvents('done', true), 'No hay nada por retirar.')}${section('Retirados', sortEvents('ret', false), 'Aún no hay eventos retirados.')}`;
}

function loansView() {
  const selectedProduct = D.lp || DB.prods[0]?.id;
  const product = productById(selectedProduct);
  const loans = (returned) => DB.loans
    .filter((loan) => Boolean(loan.b) === returned)
    .sort((first, second) => second.o.localeCompare(first.o));
  const loanRow = (loan) => `<article class="card ev"><div><b>${esc(loan.who)}</b><div class="mut">${esc(productById(loan.p)?.n || 'Producto eliminado')} ×${loan.q}. Salió el ${formatDate(loan.o)}${loan.b ? `. Devuelto el ${formatDate(loan.b)}` : ''}</div></div>${loan.b ? '' : `<button class="btn g" data-a="lb" data-i="${loan.id}">Marcar devuelto</button>`}</article>`;

  return `<h2 style="margin-top:0">Nuevo préstamo</h2><div class="card"><div class="f">
<div><label>Persona</label><input data-d="lw" value="${esc(D.lw)}"></div>
<div><label>Producto</label><select data-d="lp">${DB.prods.map((item) => `<option value="${item.id}" ${item.id == selectedProduct ? 'selected' : ''}>${esc(item.n)}</option>`).join('')}</select></div>
<div><label>Cantidad${product ? ` (quedan ${availableQuantity(product)})` : ''}</label><input type="number" min="1" data-d="lq" value="${esc(D.lq ?? 1)}"></div>
<button class="btn p" data-a="la">Registrar préstamo</button></div></div>
<h2>Sin devolver (${loans(false).length})</h2>${loans(false).map(loanRow).join('') || '<p class="mut">No hay préstamos pendientes.</p>'}
<h2>Devueltos</h2>${loans(true).map(loanRow).join('') || '<p class="mut">Aún no hay préstamos devueltos.</p>'}`;
}

function servicesView() {
  return `${dirty ? '<div class="card" style="border-color:var(--warn)"><b style="color:var(--warn)">Tienes cambios sin publicar.</b> Los clientes no los verán hasta que pulses “Publicar cambios”.</div>' : ''}
<h2>WhatsApp del negocio</h2><div class="card"><label>Número con código de país, sin el signo + (ej. 593999999999)</label><input data-w="1" inputmode="numeric" value="${esc(PUB.wa)}"></div>
<h2>Servicios que ven tus clientes</h2><div class="grid">${PUB.sv.map((service, index) => `<div class="card ed">${service.img ? `<img src="${esc(service.img)}" alt="" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px">` : '<div class="photo-placeholder">Espacio para fotografía</div>'}
<input type="file" accept="image/*" data-f="s" data-i="${index}"><div><label>Nombre</label><input data-s="${index}:t" value="${esc(service.t)}"></div><div><label>Descripción</label><textarea rows="3" data-s="${index}:d">${esc(service.d)}</textarea></div><button class="btn d" data-a="sd" data-i="${index}">Quitar servicio</button></div>`).join('')}</div>
<p style="display:flex;gap:.6rem;flex-wrap:wrap"><button class="btn" data-a="sa">Agregar servicio</button><button class="btn p" data-a="sp">Publicar cambios</button></p>
<p class="demo-notice"><b>Panel de demostración:</b> el acceso no usa credenciales y no es un sistema de seguridad. No introduzcas datos personales o información real del negocio.</p>`;
}

function reportsView() {
  const hasDemoData = DB.prods.some((product) => product.testData)
    || DB.events.some((event) => event.testData)
    || DB.loans.some((loan) => loan.testData);
  const categories = new Map();
  DB.prods.forEach((product) => {
    const category = (product.c || 'General').trim() || 'General';
    const totals = categories.get(category) || { total: 0, available: 0 };
    totals.total += Number(product.q) || 0;
    totals.available += Math.max(0, availableQuantity(product));
    categories.set(category, totals);
  });

  const eventsByStatus = [
    { label: 'Pendientes', status: 'pend', color: 'coral' },
    { label: 'Por retirar', status: 'done', color: 'gold' },
    { label: 'Retirados', status: 'ret', color: 'mint' },
  ].map((status) => ({
    ...status,
    value: DB.events.filter((event) => event.st === status.status).length,
  }));
  const loansByStatus = [
    { label: 'Sin devolver', value: DB.loans.filter((loan) => !loan.b).length, color: 'coral' },
    { label: 'Devueltos', value: DB.loans.filter((loan) => Boolean(loan.b)).length, color: 'mint' },
  ];
  const stockByCategory = [...categories.entries()]
    .map(([label, totals]) => ({
      label,
      value: totals.available,
      detail: `${totals.available} disponibles de ${totals.total}`,
      color: 'plum',
    }))
    .sort((first, second) => second.value - first.value);
  const chart = (title, rows, emptyMessage) => `<section class="report-block"><h3>${title}</h3>${rows.length
    ? `<div class="report-bars" role="img" aria-label="${title}">${rows.map((row) => {
      const max = Math.max(1, ...rows.map((item) => item.value));
      const width = Math.round((row.value / max) * 100);
      return `<div class="report-bar"><div class="report-bar__label"><span>${esc(row.label)}</span><b>${esc(row.detail ?? row.value)}</b></div><div class="report-track"><span class="report-fill ${row.color}" style="width:${width}%"></span></div></div>`;
    }).join('')}</div>`
    : `<p class="mut">${emptyMessage}</p>`}</section>`;
  const statusName = (status) => ({ pend: 'Pendiente', done: 'Por retirar', ret: 'Retirado' }[status] || 'Otro');
  const unitCount = (event) => (event.items || []).reduce((total, item) => total + (Number(item.q) || 0), 0);
  const totalStock = DB.prods.reduce((total, product) => total + (Number(product.q) || 0), 0);
  const freeStock = DB.prods.reduce((total, product) => total + Math.max(0, availableQuantity(product)), 0);
  const rentedStock = DB.events.filter((event) => event.st !== 'ret').reduce((total, event) => total + unitCount(event), 0);
  const loanedStock = DB.loans.filter((loan) => !loan.b).reduce((total, loan) => total + (Number(loan.q) || 0), 0);
  const metrics = [
    { label: 'Productos', value: DB.prods.length, note: `${totalStock} unidades en inventario`, color: 'plum' },
    { label: 'Disponibles', value: freeStock, note: 'Unidades en bodega', color: 'mint' },
    { label: 'Eventos activos', value: DB.events.filter((event) => event.st !== 'ret').length, note: `${rentedStock} unidades reservadas`, color: 'coral' },
    { label: 'Préstamos abiertos', value: DB.loans.filter((loan) => !loan.b).length, note: `${loanedStock} unidades prestadas`, color: 'gold' },
  ];

  return `<section class="report-page" aria-labelledby="report-title">
<header class="report-head"><div><p class="report-eyebrow">Control del negocio</p><h2 id="report-title">Informe general</h2><p class="mut">Generado el ${formatDate(today())}</p></div><div class="report-actions no-print"><button class="btn" data-a="seedDemo" ${hasDemoData ? 'disabled' : ''}>Cargar datos de prueba</button>${hasDemoData ? '<button class="btn d" data-a="clearDemo">Quitar datos de prueba</button>' : ''}<button class="btn p" data-a="print">Imprimir o guardar PDF</button></div></header>
${hasDemoData ? '<p class="report-demo-note no-print">Los registros de demostración están guardados solo en este navegador. Puedes quitarlos sin afectar tus datos reales.</p>' : ''}
<div class="report-metrics">${metrics.map((metric) => `<article class="report-metric ${metric.color}"><span>${metric.label}</span><strong>${metric.value}</strong><small>${metric.note}</small></article>`).join('')}</div>
<div class="report-charts">${chart('Unidades disponibles por categoría', stockByCategory, 'Agrega productos para ver el inventario por categoría.')}${chart('Eventos por estado', eventsByStatus, 'Aún no hay eventos registrados.')}${chart('Préstamos por estado', loansByStatus, 'Aún no hay préstamos registrados.')}</div>
<section class="report-detail"><h3>Detalle de inventario</h3><div class="tbl"><table><thead><tr><th>Producto</th><th>Categoría</th><th>Total</th><th>Disponible</th><th>Alquilado</th><th>Prestado</th></tr></thead><tbody>${DB.prods.map((product) => {
    const rented = DB.events.filter((event) => event.st !== 'ret').reduce((total, event) => total + (event.items || []).filter((item) => item.p == product.id).reduce((sum, item) => sum + item.q, 0), 0);
    const loaned = loanQuantity(product.id);
    return `<tr><td>${esc(product.n)}</td><td>${esc(product.c || 'General')}</td><td>${product.q}</td><td>${Math.max(0, availableQuantity(product))}</td><td>${rented}</td><td>${loaned}</td></tr>`;
  }).join('') || '<tr><td colspan="6" class="mut">No hay productos registrados.</td></tr>'}</tbody></table></div></section>
<section class="report-detail"><h3>Detalle de eventos</h3><div class="tbl"><table><thead><tr><th>Fecha</th><th>Evento</th><th>Cliente</th><th>Estado</th><th>Unidades</th></tr></thead><tbody>${[...DB.events].sort((first, second) => (first.d || '').localeCompare(second.d || '')).map((event) => `<tr><td>${formatDate(event.d)}</td><td>${esc(event.n)}</td><td>${esc(event.cl)}</td><td>${statusName(event.st)}</td><td>${unitCount(event)}</td></tr>`).join('') || '<tr><td colspan="5" class="mut">No hay eventos registrados.</td></tr>'}</tbody></table></div></section>
<section class="report-detail"><h3>Detalle de préstamos</h3><div class="tbl"><table><thead><tr><th>Persona</th><th>Producto</th><th>Cantidad</th><th>Salida</th><th>Devolución</th><th>Estado</th></tr></thead><tbody>${DB.loans.map((loan) => `<tr><td>${esc(loan.who)}</td><td>${esc(productById(loan.p)?.n || 'Producto eliminado')}</td><td>${loan.q}</td><td>${formatDate(loan.o)}</td><td>${loan.b ? formatDate(loan.b) : 'Pendiente'}</td><td>${loan.b ? 'Devuelto' : 'Sin devolver'}</td></tr>`).join('') || '<tr><td colspan="6" class="mut">No hay préstamos registrados.</td></tr>'}</tbody></table></div></section>
<section class="report-detail"><h3>Servicios publicados (${PUB.sv.length})</h3><div class="tbl"><table><thead><tr><th>Servicio</th><th>Descripción</th><th>Foto</th></tr></thead><tbody>${PUB.sv.map((service) => `<tr><td>${esc(service.t)}</td><td>${esc(service.d)}</td><td>${service.img ? 'Sí' : 'No'}</td></tr>`).join('') || '<tr><td colspan="3" class="mut">No hay servicios publicados.</td></tr>'}</tbody></table></div></section>
</section>`;
}

function seedDemoData() {
  window.DemoData.addTo(DB, save);
  render();
  toast('Se cargaron datos de prueba. Puedes quitarlos desde este informe.');
}

function clearDemoData() {
  window.DemoData.removeFrom(DB, save);
  render();
  toast('Se quitaron los datos de prueba. Tus datos reales se conservaron.');
}

$('#app').oninput = (event) => {
  const { dataset } = event.target;
  if (dataset.d) D[dataset.d] = event.target.value;
  if (dataset.s) {
    const [index, key] = dataset.s.split(':');
    PUB.sv[index][key] = event.target.value;
    dirty = 1;
  }
  if (dataset.w) {
    PUB.wa = event.target.value.replace(/\D/g, '');
    dirty = 1;
  }
};

$('#app').onchange = async (event) => {
  const input = event.target;
  if (input.type !== 'file' || !input.files[0]) return;

  const image = await shrinkImage(input.files[0]);
  if (!image) return toast('No se pudo leer esa imagen.');
  if (input.dataset.f === 'p') D.img = image;
  else {
    PUB.sv[Number(input.dataset.i)].img = image;
    dirty = 1;
  }
  render();
};

$('#app').onclick = async (event) => {
  const button = event.target.closest('[data-a]');
  if (!button) return;

  const { a: action, i: id } = button.dataset;
  if (action === 'go') return go(id);
  if (action === 'demoAdmin') {
    sessionStorage.setItem('adm', '1');
    return go('inv');
  }
  if (action === 'c') {
    if (!PUB.wa) return toast('Este servicio aún no tiene número de contacto.');
    return void window.open(`https://wa.me/${PUB.wa}?text=${encodeURIComponent(`Hola, deseo información sobre este servicio: ${PUB.sv[id].t}`)}`, '_blank', 'noopener');
  }
  if (action === 'share') return copyServiceLink(id);
  if (action === 'contact') {
    if (!PUB.wa) return toast('Este servicio aún no tiene número de contacto.');
    return void window.open(`https://wa.me/${PUB.wa}?text=${encodeURIComponent('Hola, quiero cotizar la decoración y los servicios para mi evento.')}`, '_blank', 'noopener');
  }
  if (action === 'logout') {
    sessionStorage.removeItem('adm');
    return go('pub');
  }
  if (!isAdmin()) return;
  if (action === 'print') return window.print();
  if (action === 'seedDemo') {
    if (DB.prods.some((product) => product.testData) || DB.events.some((item) => item.testData) || DB.loans.some((item) => item.testData)) {
      return toast('Ya hay datos de prueba. Quítalos antes de volver a cargarlos.');
    }
    return seedDemoData();
  }
  if (action === 'clearDemo') return clearDemoData();

  if (action === 'addp') {
    const name = (D.pn || '').trim();
    if (!name) return toast('Escribe el nombre del producto.');
    DB.prods.push({
      id: Date.now(),
      n: name,
      c: (D.pc || '').trim() || 'General',
      q: Math.max(1, +D.pq || 1),
      img: D.img || '',
    });
    save();
    D = { items: [] };
    return render();
  }

  const product = productById(id);
  if (action === 'pinc') product.q++;
  else if (action === 'pdec') {
    if (product.q <= 1 || availableQuantity(product) < 1) {
      return toast('No se puede restar: las unidades restantes están alquiladas o prestadas.');
    }
    product.q--;
  } else if (action === 'pdel') {
    if (eventQuantity(product.id) + loanQuantity(product.id)) {
      return toast('Este producto está alquilado o prestado. Recupéralo antes de eliminarlo.');
    }
    DB.prods = DB.prods.filter((item) => item !== product);
  } else if (action === 'ei') {
    const productId = D.ip || DB.prods[0]?.id;
    const selected = productById(productId);
    const quantity = Math.max(1, +D.iq || 1);
    if (!selected) return toast('Primero agrega productos al inventario.');
    const used = D.items.filter((item) => item.p == productId).reduce((total, item) => total + item.q, 0);
    if (quantity + used > availableQuantity(selected)) {
      return toast(`Solo quedan ${availableQuantity(selected) - used} unidades de ${selected.n}.`);
    }
    const existing = D.items.find((item) => item.p == productId);
    if (existing) existing.q += quantity;
    else D.items.push({ p: productId, q: quantity });
    D.iq = 1;
  } else if (action === 'er') {
    D.items.splice(Number(id), 1);
  } else if (action === 'es') {
    if (!(D.cl || '').trim() || !(D.en || '').trim()) return toast('Escribe el cliente y el nombre del evento.');
    if (!D.items.length) return toast('Agrega al menos un producto al evento.');
    DB.events.push({
      id: Date.now(),
      cl: D.cl.trim(),
      n: D.en.trim(),
      d: D.ed || '',
      pl: (D.ep || '').trim(),
      items: D.items,
      st: 'pend',
    });
    save();
    D = { items: [] };
    return render();
  } else if (action === 'edone' || action === 'eback') {
    DB.events.find((item) => item.id == id).st = action === 'edone' ? 'done' : 'ret';
  } else if (action === 'edel') {
    DB.events = DB.events.filter((item) => item.id != id);
  } else if (action === 'la') {
    const productId = D.lp || DB.prods[0]?.id;
    const selected = productById(productId);
    const quantity = Math.max(1, +D.lq || 1);
    if (!(D.lw || '').trim()) return toast('Escribe quién se lleva el producto.');
    if (!selected) return toast('Primero agrega productos al inventario.');
    if (quantity > availableQuantity(selected)) return toast(`Solo quedan ${availableQuantity(selected)} unidades de ${selected.n}.`);
    DB.loans.push({ id: Date.now(), who: D.lw.trim(), p: productId, q: quantity, o: today(), b: '' });
    save();
    D = { items: [] };
    return render();
  } else if (action === 'lb') {
    DB.loans.find((item) => item.id == id).b = today();
  } else if (action === 'sa') {
    PUB.sv.push({ t: 'Nuevo servicio', d: 'Describe el servicio.', img: '' });
    dirty = 1;
  } else if (action === 'sd') {
    PUB.sv.splice(Number(id), 1);
    dirty = 1;
  } else if (action === 'sp') {
    return publish();
  }

  save();
  render();
};

async function publish() {
  try {
    const artifact = window.claude && await window.claude.use('artifact').catch(() => null);
    const documentCopy = document.documentElement.cloneNode(true);
    documentCopy.querySelector('#pubdata').textContent = JSON.stringify(PUB).replace(/</g, '\\u003c');
    documentCopy.querySelectorAll('[data-dyn]').forEach((element) => {
      element.innerHTML = '';
    });
    const html = '<!DOCTYPE html>\n' + documentCopy.outerHTML;

    if (!artifact) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      link.download = 'index.html';
      link.click();
      dirty = 0;
      render();
      return toast('Se descargó index.html con tus cambios. Súbelo a tu hosting reemplazando el anterior para que valgan para todos.');
    }

    dirty = 0;
    await artifact.publish(html);
  } catch (error) {
    dirty = 1;
    render();
    toast(error && error.code === 'conflict'
      ? 'Otra versión se publicó antes. Recarga y repite el cambio.'
      : 'No se pudo publicar. Inténtalo otra vez.');
  }
}

$('#toast').hidden = true;
render();
