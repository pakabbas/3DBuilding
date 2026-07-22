(() => {
  const API = 'api.php';
  const state = {
    user: null,
    data: null,
    stats: null,
    images: [],
    view: 'overview',
    floorFilter: '',
    unitQuery: '',
  };

  const els = {
    loginScreen: document.getElementById('login-screen'),
    appShell: document.getElementById('app-shell'),
    loginForm: document.getElementById('login-form'),
    loginError: document.getElementById('login-error'),
    viewRoot: document.getElementById('view-root'),
    pageTitle: document.getElementById('page-title'),
    nav: document.getElementById('nav'),
    logoutBtn: document.getElementById('logout-btn'),
    adminUser: document.getElementById('admin-user-label'),
    buildingName: document.getElementById('sidebar-building-name'),
    menuToggle: document.getElementById('menu-toggle'),
    sidebarBackdrop: document.getElementById('sidebar-backdrop'),
    modal: document.getElementById('modal'),
    modalTitle: document.getElementById('modal-title'),
    modalBody: document.getElementById('modal-body'),
    modalFooter: document.getElementById('modal-footer'),
    modalClose: document.getElementById('modal-close'),
    modalBackdrop: document.getElementById('modal-backdrop'),
    toast: document.getElementById('toast'),
  };

  const titles = {
    overview: 'Overview',
    building: 'Building',
    floors: 'Floors & Units',
    amenities: 'Amenities',
    images: 'Images',
  };

  async function api(action, { method = 'GET', body, formData } = {}) {
    const opts = { method, credentials: 'same-origin' };
    if (formData) {
      opts.body = formData;
    } else if (body !== undefined) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(`${API}?action=${encodeURIComponent(action)}`, opts);
    let json = null;
    try {
      json = await res.json();
    } catch {
      throw new Error('Invalid server response');
    }
    if (!res.ok || json.ok === false) {
      const err = new Error(json.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  function toast(message, isError = false) {
    els.toast.textContent = message;
    els.toast.classList.toggle('error', isError);
    els.toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => els.toast.classList.remove('show'), 2600);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
  }

  function setAuthUI(loggedIn) {
    els.loginScreen.classList.toggle('hidden', loggedIn);
    els.appShell.classList.toggle('hidden', !loggedIn);
  }

  function openModal(title, bodyHtml, footerHtml) {
    els.modalTitle.textContent = title;
    els.modalBody.innerHTML = bodyHtml;
    els.modalFooter.innerHTML = footerHtml || '';
    els.modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    els.modal.setAttribute('aria-hidden', 'true');
    els.modalBody.innerHTML = '';
    els.modalFooter.innerHTML = '';
  }

  async function refreshBootstrap() {
    const res = await api('bootstrap');
    state.data = res.data;
    state.stats = res.stats;
    state.images = res.images || [];
    els.buildingName.textContent = state.data.building.name || 'Skyline';
    render();
  }

  function amenityUsage(name) {
    let n = 0;
    state.data.floors.forEach((f) => {
      f.units.forEach((u) => {
        if ((u.amenities || []).includes(name)) n += 1;
      });
    });
    return n;
  }

  function renderOverview() {
    const s = state.stats || {};
    els.viewRoot.innerHTML = `
      <div class="stats">
        <div class="stat-card"><div class="label">Floors</div><div class="value">${s.floors ?? 0}</div></div>
        <div class="stat-card"><div class="label">Units</div><div class="value">${s.units ?? 0}</div></div>
        <div class="stat-card"><div class="label">Available</div><div class="value">${s.available ?? 0}</div></div>
        <div class="stat-card"><div class="label">Reserved</div><div class="value">${s.reserved ?? 0}</div></div>
        <div class="stat-card"><div class="label">Sold</div><div class="value">${s.sold ?? 0}</div></div>
        <div class="stat-card"><div class="label">Amenities</div><div class="value">${s.amenities ?? 0}</div></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Quick tips</h3></div>
        <div class="panel-body">
          <p class="muted" style="margin:0;line-height:1.6">
            Use <strong>Floors &amp; Units</strong> for unit CRUD (price, status, images, amenities).
            Amenities managed here also appear as filters on the customer site when saved into the JSON catalog.
            Uploaded images are stored under <code>model/UnitImages/</code>.
          </p>
        </div>
      </div>
    `;
  }

  function renderBuilding() {
    const b = state.data.building;
    els.viewRoot.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h3>Building details</h3></div>
        <div class="panel-body">
          <form id="building-form">
            <div class="field">
              <label for="b-name">Name</label>
              <input id="b-name" name="name" value="${escapeHtml(b.name)}" required />
            </div>
            <div class="field">
              <label for="b-tagline">Tagline</label>
              <input id="b-tagline" name="tagline" value="${escapeHtml(b.tagline)}" />
            </div>
            <p class="muted">Totals update automatically from floors and units
              (currently ${b.totalFloors} floors · ${b.totalUnits} units).</p>
            <button class="btn btn-gold" type="submit">Save building</button>
          </form>
        </div>
      </div>
    `;
    document.getElementById('building-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const res = await api('building', {
          method: 'PUT',
          body: { name: fd.get('name'), tagline: fd.get('tagline') },
        });
        state.data.building = res.building;
        state.stats = res.stats;
        els.buildingName.textContent = res.building.name;
        toast('Building saved');
        render();
      } catch (err) {
        toast(err.message, true);
      }
    });
  }

  function unitRowHtml(floor, unit) {
    const amenities = (unit.amenities || []).slice(0, 3).map((a) => `<span class="tag">${escapeHtml(a)}</span>`).join('');
    const more = (unit.amenities || []).length > 3 ? `<span class="muted">+${unit.amenities.length - 3}</span>` : '';
    return `
      <tr>
        <td><strong>${escapeHtml(unit.id)}</strong><div class="muted">${escapeHtml(unit.name)}</div></td>
        <td>${escapeHtml(unit.price)}</td>
        <td>${escapeHtml(unit.area)}</td>
        <td>${unit.bedrooms}/${unit.bathrooms}</td>
        <td><span class="pill ${escapeHtml(unit.status)}">${escapeHtml(unit.status)}</span></td>
        <td>${escapeHtml(unit.quadrant)}</td>
        <td>${amenities}${more}</td>
        <td>${(unit.images || []).length}</td>
        <td>
          <div class="row-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-edit-unit="${escapeHtml(floor.id)}|${escapeHtml(unit.id)}">Edit</button>
            <button type="button" class="btn btn-danger btn-sm" data-del-unit="${escapeHtml(floor.id)}|${escapeHtml(unit.id)}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderFloors() {
    const q = state.unitQuery.trim().toLowerCase();
    const floorFilter = state.floorFilter;
    const floors = state.data.floors.filter((f) => !floorFilter || String(f.id) === String(floorFilter));

    const blocks = floors.map((floor) => {
      let units = floor.units || [];
      if (q) {
        units = units.filter((u) =>
          [u.id, u.name, u.price, u.status, u.quadrant, ...(u.amenities || [])]
            .join(' ')
            .toLowerCase()
            .includes(q)
        );
      }
      const rows = units.length
        ? units.map((u) => unitRowHtml(floor, u)).join('')
        : `<tr><td colspan="9" class="empty">No units${q ? ' match this search' : ''}.</td></tr>`;
      return `
        <div class="floor-block">
          <div class="floor-head">
            <div>
              <h4>${escapeHtml(floor.name)}</h4>
              <div class="muted">Floor id ${floor.id} · height ${floor.heightWeight} · ${floor.units.length} units</div>
            </div>
            <div class="row-actions">
              <button type="button" class="btn btn-ghost btn-sm" data-edit-floor="${floor.id}">Edit floor</button>
              <button type="button" class="btn btn-gold btn-sm" data-add-unit="${floor.id}">Add unit</button>
              <button type="button" class="btn btn-danger btn-sm" data-del-floor="${floor.id}">Delete</button>
            </div>
          </div>
          <div class="floor-body table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Unit</th><th>Price</th><th>Area</th><th>Beds/Baths</th>
                  <th>Status</th><th>Quad</th><th>Amenities</th><th>Images</th><th></th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;
    }).join('') || `<div class="panel"><div class="panel-body empty">No floors yet.</div></div>`;

    const floorOptions = state.data.floors
      .map((f) => `<option value="${f.id}" ${String(floorFilter) === String(f.id) ? 'selected' : ''}>${escapeHtml(f.name)}</option>`)
      .join('');

    els.viewRoot.innerHTML = `
      <div class="toolbar">
        <button type="button" class="btn btn-gold" id="add-floor-btn">Add floor</button>
        <select id="floor-filter" class="search" style="border-radius:12px;min-width:160px">
          <option value="">All floors</option>
          ${floorOptions}
        </select>
        <input class="search" id="unit-search" placeholder="Search units…" value="${escapeHtml(state.unitQuery)}" />
        <div class="spacer"></div>
      </div>
      ${blocks}
    `;

    document.getElementById('add-floor-btn').onclick = () => openFloorModal();
    document.getElementById('floor-filter').onchange = (e) => {
      state.floorFilter = e.target.value;
      render();
    };
    document.getElementById('unit-search').oninput = (e) => {
      state.unitQuery = e.target.value;
      clearTimeout(renderFloors._t);
      renderFloors._t = setTimeout(render, 180);
    };

    els.viewRoot.querySelectorAll('[data-edit-floor]').forEach((btn) => {
      btn.onclick = () => {
        const floor = state.data.floors.find((f) => String(f.id) === btn.dataset.editFloor);
        openFloorModal(floor);
      };
    });
    els.viewRoot.querySelectorAll('[data-del-floor]').forEach((btn) => {
      btn.onclick = () => deleteFloor(btn.dataset.delFloor);
    });
    els.viewRoot.querySelectorAll('[data-add-unit]').forEach((btn) => {
      btn.onclick = () => openUnitModal(btn.dataset.addUnit);
    });
    els.viewRoot.querySelectorAll('[data-edit-unit]').forEach((btn) => {
      btn.onclick = () => {
        const [floorId, unitId] = btn.dataset.editUnit.split('|');
        openUnitModal(floorId, unitId);
      };
    });
    els.viewRoot.querySelectorAll('[data-del-unit]').forEach((btn) => {
      btn.onclick = () => {
        const [floorId, unitId] = btn.dataset.delUnit.split('|');
        deleteUnit(floorId, unitId);
      };
    });
  }

  function openFloorModal(floor) {
    const isEdit = !!floor;
    openModal(
      isEdit ? 'Edit floor' : 'Add floor',
      `
        <form id="floor-form">
          ${isEdit ? '' : `
            <div class="field">
              <label for="f-id">Floor id (optional)</label>
              <input id="f-id" name="id" type="number" min="1" placeholder="Auto" />
            </div>`}
          <div class="field">
            <label for="f-name">Name</label>
            <input id="f-name" name="name" required value="${escapeHtml(floor?.name || '')}" />
          </div>
          <div class="field">
            <label for="f-hw">Height weight</label>
            <input id="f-hw" name="heightWeight" type="number" step="0.1" min="0.1" value="${floor?.heightWeight ?? 1}" />
          </div>
        </form>
      `,
      `
        <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
        <button type="button" class="btn btn-gold" id="floor-save">${isEdit ? 'Save' : 'Create'}</button>
      `
    );
    els.modalFooter.querySelector('[data-cancel]').onclick = closeModal;
    document.getElementById('floor-save').onclick = async () => {
      const form = document.getElementById('floor-form');
      const fd = new FormData(form);
      try {
        if (isEdit) {
          await api('floor', {
            method: 'PUT',
            body: {
              id: floor.id,
              name: fd.get('name'),
              heightWeight: Number(fd.get('heightWeight')),
            },
          });
          toast('Floor updated');
        } else {
          const body = {
            name: fd.get('name'),
            heightWeight: Number(fd.get('heightWeight')),
          };
          const idVal = fd.get('id');
          if (idVal) body.id = Number(idVal);
          await api('floor', { method: 'POST', body });
          toast('Floor created');
        }
        closeModal();
        await refreshBootstrap();
      } catch (err) {
        toast(err.message, true);
      }
    };
  }

  async function deleteFloor(id) {
    const floor = state.data.floors.find((f) => String(f.id) === String(id));
    if (!floor) return;
    if (!confirm(`Delete floor "${floor.name}" and all its units?`)) return;
    try {
      const res = await fetch(`${API}?action=floor&id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || 'Delete failed');
      toast('Floor deleted');
      await refreshBootstrap();
    } catch (err) {
      toast(err.message, true);
    }
  }

  function openUnitModal(floorId, unitId) {
    const floor = state.data.floors.find((f) => String(f.id) === String(floorId));
    if (!floor) return;
    const unit = unitId ? floor.units.find((u) => String(u.id) === String(unitId)) : null;
    const isEdit = !!unit;
    const catalog = state.data.amenityCatalog || [];
    const selected = new Set(unit?.amenities || []);
    const featuresText = (unit?.features || []).join('\n');
    const imagesText = (unit?.images || []).join('\n');
    const imageOptions = state.images
      .map((img) => `<option value="${escapeHtml(img.path)}">${escapeHtml(img.name)}</option>`)
      .join('');

    openModal(
      isEdit ? `Edit ${unit.id}` : `Add unit · ${floor.name}`,
      `
        <form id="unit-form">
          <div class="field-row">
            <div class="field">
              <label for="u-id">Unit id</label>
              <input id="u-id" name="id" required value="${escapeHtml(unit?.id || '')}" />
            </div>
            <div class="field">
              <label for="u-name">Name</label>
              <input id="u-name" name="name" required value="${escapeHtml(unit?.name || '')}" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label for="u-price">Price</label>
              <input id="u-price" name="price" value="${escapeHtml(unit?.price || '')}" />
            </div>
            <div class="field">
              <label for="u-area">Area</label>
              <input id="u-area" name="area" value="${escapeHtml(unit?.area || '')}" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label for="u-beds">Bedrooms</label>
              <input id="u-beds" name="bedrooms" type="number" min="0" value="${unit?.bedrooms ?? 0}" />
            </div>
            <div class="field">
              <label for="u-baths">Bathrooms</label>
              <input id="u-baths" name="bathrooms" type="number" min="0" value="${unit?.bathrooms ?? 0}" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label for="u-status">Status</label>
              <select id="u-status" name="status">
                ${['available', 'reserved', 'sold'].map((s) =>
                  `<option value="${s}" ${unit?.status === s ? 'selected' : ''}>${s}</option>`
                ).join('')}
              </select>
            </div>
            <div class="field">
              <label for="u-quad">Quadrant</label>
              <select id="u-quad" name="quadrant">
                ${['NE', 'NW', 'SE', 'SW'].map((q) =>
                  `<option value="${q}" ${unit?.quadrant === q ? 'selected' : ''}>${q}</option>`
                ).join('')}
              </select>
            </div>
          </div>
          <div class="field">
            <label>Amenities</label>
            <div class="check-grid" id="u-amenities">
              ${catalog.map((a) => `
                <label><input type="checkbox" value="${escapeHtml(a)}" ${selected.has(a) ? 'checked' : ''}/> ${escapeHtml(a)}</label>
              `).join('') || '<span class="muted">No amenities in catalog yet.</span>'}
            </div>
          </div>
          <div class="field">
            <label for="u-features">Features (one per line)</label>
            <textarea id="u-features" name="features">${escapeHtml(featuresText)}</textarea>
          </div>
          <div class="field">
            <label for="u-images">Images (one path per line)</label>
            <textarea id="u-images" name="images">${escapeHtml(imagesText)}</textarea>
          </div>
          <div class="field">
            <label for="u-pick-image">Append uploaded image</label>
            <div class="chip-input">
              <select id="u-pick-image"><option value="">Select…</option>${imageOptions}</select>
              <button type="button" class="btn btn-ghost btn-sm" id="append-image">Add path</button>
            </div>
          </div>
        </form>
      `,
      `
        <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
        <button type="button" class="btn btn-gold" id="unit-save">${isEdit ? 'Save unit' : 'Create unit'}</button>
      `
    );

    els.modalFooter.querySelector('[data-cancel]').onclick = closeModal;
    document.getElementById('append-image').onclick = () => {
      const pick = document.getElementById('u-pick-image').value;
      if (!pick) return;
      const ta = document.getElementById('u-images');
      const lines = ta.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (!lines.includes(pick)) lines.push(pick);
      ta.value = lines.join('\n');
    };

    document.getElementById('unit-save').onclick = async () => {
      const form = document.getElementById('unit-form');
      const fd = new FormData(form);
      const amenities = [...document.querySelectorAll('#u-amenities input:checked')].map((el) => el.value);
      const features = String(fd.get('features') || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const images = String(fd.get('images') || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const payload = {
        floorId,
        originalId: unit?.id,
        unit: {
          id: fd.get('id'),
          name: fd.get('name'),
          price: fd.get('price'),
          area: fd.get('area'),
          bedrooms: Number(fd.get('bedrooms')),
          bathrooms: Number(fd.get('bathrooms')),
          status: fd.get('status'),
          quadrant: fd.get('quadrant'),
          amenities,
          features,
          images,
        },
      };
      try {
        await api('unit', { method: isEdit ? 'PUT' : 'POST', body: payload });
        toast(isEdit ? 'Unit saved' : 'Unit created');
        closeModal();
        await refreshBootstrap();
      } catch (err) {
        toast(err.message, true);
      }
    };
  }

  async function deleteUnit(floorId, unitId) {
    if (!confirm(`Delete unit ${unitId}?`)) return;
    try {
      const res = await fetch(
        `${API}?action=unit&floorId=${encodeURIComponent(floorId)}&id=${encodeURIComponent(unitId)}`,
        { method: 'DELETE', credentials: 'same-origin' }
      );
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || 'Delete failed');
      toast('Unit deleted');
      await refreshBootstrap();
    } catch (err) {
      toast(err.message, true);
    }
  }

  function renderAmenities() {
    const catalog = state.data.amenityCatalog || [];
    const cards = catalog.map((name) => `
      <div class="amenity-item">
        <strong>${escapeHtml(name)}</strong>
        <div class="muted" style="margin:8px 0 12px">Used on ${amenityUsage(name)} units</div>
        <div class="row-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-rename="${escapeHtml(name)}">Rename</button>
          <button type="button" class="btn btn-danger btn-sm" data-del-amenity="${escapeHtml(name)}">Delete</button>
        </div>
      </div>
    `).join('') || '<div class="empty">No amenities yet.</div>';

    els.viewRoot.innerHTML = `
      <div class="toolbar">
        <button type="button" class="btn btn-gold" id="add-amenity-btn">Add amenity</button>
      </div>
      <div class="amenity-list">${cards}</div>
    `;

    document.getElementById('add-amenity-btn').onclick = () => {
      const name = prompt('New amenity name');
      if (!name || !name.trim()) return;
      api('amenities', { method: 'POST', body: { name: name.trim() } })
        .then(async () => {
          toast('Amenity added');
          await refreshBootstrap();
        })
        .catch((err) => toast(err.message, true));
    };

    els.viewRoot.querySelectorAll('[data-rename]').forEach((btn) => {
      btn.onclick = () => {
        const from = btn.dataset.rename;
        const to = prompt('Rename amenity', from);
        if (!to || !to.trim() || to.trim() === from) return;
        api('amenities', { method: 'PUT', body: { from, to: to.trim() } })
          .then(async () => {
            toast('Amenity renamed across units');
            await refreshBootstrap();
          })
          .catch((err) => toast(err.message, true));
      };
    });

    els.viewRoot.querySelectorAll('[data-del-amenity]').forEach((btn) => {
      btn.onclick = async () => {
        const name = btn.dataset.delAmenity;
        if (!confirm(`Remove "${name}" from catalog and all units?`)) return;
        try {
          const res = await fetch(`${API}?action=amenities&name=${encodeURIComponent(name)}`, {
            method: 'DELETE',
            credentials: 'same-origin',
          });
          const json = await res.json();
          if (!res.ok || json.ok === false) throw new Error(json.error || 'Delete failed');
          toast('Amenity deleted');
          await refreshBootstrap();
        } catch (err) {
          toast(err.message, true);
        }
      };
    });
  }

  function renderImages() {
    const cards = (state.images || []).map((img) => `
      <div class="image-card">
        <img src="../${escapeHtml(img.path)}" alt="${escapeHtml(img.name)}" loading="lazy" />
        <div class="meta">${escapeHtml(img.name)}<br/>Used by ${img.usedBy} unit(s)</div>
        <button type="button" class="btn btn-danger btn-sm" data-del-image="${escapeHtml(img.path)}">Delete</button>
      </div>
    `).join('') || '<div class="empty">No images in UnitImages yet.</div>';

    els.viewRoot.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h3>Upload image</h3></div>
        <div class="panel-body">
          <form id="upload-form" class="toolbar">
            <input type="file" id="upload-file" accept="image/jpeg,image/png,image/webp" required />
            <button class="btn btn-gold" type="submit">Upload</button>
          </form>
          <p class="muted" style="margin:0">JPG, PNG, or WebP up to 5MB. Assign images to units from the unit editor.</p>
        </div>
      </div>
      <div style="height:18px"></div>
      <div class="image-grid">${cards}</div>
    `;

    document.getElementById('upload-form').onsubmit = async (e) => {
      e.preventDefault();
      const file = document.getElementById('upload-file').files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append('image', file);
      try {
        const res = await api('upload', { method: 'POST', formData: fd });
        state.images = res.images;
        state.stats = res.stats;
        toast(`Uploaded ${res.path}`);
        render();
      } catch (err) {
        toast(err.message, true);
      }
    };

    els.viewRoot.querySelectorAll('[data-del-image]').forEach((btn) => {
      btn.onclick = async () => {
        const path = btn.dataset.delImage;
        if (!confirm(`Delete ${path}? It will also be removed from any units.`)) return;
        try {
          const res = await fetch(`${API}?action=image&path=${encodeURIComponent(path)}`, {
            method: 'DELETE',
            credentials: 'same-origin',
          });
          const json = await res.json();
          if (!res.ok || json.ok === false) throw new Error(json.error || 'Delete failed');
          state.images = json.images;
          state.stats = json.stats;
          toast('Image deleted');
          await refreshBootstrap();
        } catch (err) {
          toast(err.message, true);
        }
      };
    });
  }

  function render() {
    if (!state.data) return;
    els.pageTitle.textContent = titles[state.view] || 'Admin';
    els.nav.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === state.view);
    });
    if (state.view === 'overview') renderOverview();
    else if (state.view === 'building') renderBuilding();
    else if (state.view === 'floors') renderFloors();
    else if (state.view === 'amenities') renderAmenities();
    else if (state.view === 'images') renderImages();
  }

  // Events
  els.nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-btn');
    if (!btn) return;
    state.view = btn.dataset.view;
    closeSidebar();
    render();
  });

  els.menuToggle.addEventListener('click', () => {
    document.body.classList.toggle('sidebar-open');
  });
  els.sidebarBackdrop.addEventListener('click', closeSidebar);

  els.modalClose.addEventListener('click', closeModal);
  els.modalBackdrop.addEventListener('click', closeModal);

  els.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    els.loginError.textContent = '';
    const fd = new FormData(els.loginForm);
    try {
      const res = await api('login', {
        method: 'POST',
        body: { username: fd.get('username'), password: fd.get('password') },
      });
      state.user = res.user;
      els.adminUser.textContent = res.user;
      setAuthUI(true);
      await refreshBootstrap();
    } catch (err) {
      els.loginError.textContent = err.message;
    }
  });

  els.logoutBtn.addEventListener('click', async () => {
    try {
      await api('logout', { method: 'POST', body: {} });
    } catch {
      /* ignore */
    }
    state.user = null;
    state.data = null;
    setAuthUI(false);
  });

  async function boot() {
    try {
      const me = await api('me');
      if (me.loggedIn) {
        state.user = me.user;
        els.adminUser.textContent = me.user;
        setAuthUI(true);
        await refreshBootstrap();
      } else {
        setAuthUI(false);
      }
    } catch {
      setAuthUI(false);
    }
  }

  boot();
})();
