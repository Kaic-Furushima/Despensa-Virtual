import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import {
    collection,
    addDoc,
    query,
    where,
    onSnapshot,
    deleteDoc,
    updateDoc,
    doc
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// ---------- DOM ----------
const userEmailDisplay = document.getElementById('userEmailDisplay');
const btnLogout = document.getElementById('btnLogout');
const addFoodForm = document.getElementById('addFoodForm');
const foodList = document.getElementById('foodList');
const alertsContainer = document.getElementById('alertsContainer');
const btnSuggestRecipes = document.getElementById('btnSuggestRecipes');
const recipesList = document.getElementById('recipesList');
const searchInput = document.getElementById('searchFood');
const editFoodForm = document.getElementById('editFoodForm');
const toastContainer = document.getElementById('toastContainer');

const EXPIRING_DAYS = 7;

let currentUser = null;
let currentFoods = [];
let unsubscribeFoods = null;

// ---------- Utilitários ----------
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function normalize(text) {
    return String(text ?? '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .trim();
}

function showToast(message, type = 'success') {
    if (!toastContainer) return;
    const el = document.createElement('div');
    el.className = `toast align-items-center text-bg-${type} border-0`;
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'assertive');
    el.setAttribute('aria-atomic', 'true');
    el.innerHTML = `
        <div class="d-flex">
            <div class="toast-body"></div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Fechar"></button>
        </div>`;
    el.querySelector('.toast-body').textContent = message;
    toastContainer.appendChild(el);
    const toast = new bootstrap.Toast(el, { delay: 4000 });
    el.addEventListener('hidden.bs.toast', () => el.remove());
    toast.show();
}

function parseDate(dateString) {
    if (typeof dateString !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatDateBr(dateString) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

// Dias até vencer (negativo = já vencido). null se data inválida.
function daysUntil(dateString) {
    const exp = parseDate(dateString);
    if (!exp) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((exp - today) / 86400000);
}

function checkExpiring(dateString) {
    const d = daysUntil(dateString);
    return d !== null && d >= 0 && d <= EXPIRING_DAYS;
}

function checkExpired(dateString) {
    const d = daysUntil(dateString);
    return d !== null && d < 0;
}

function statusBadge(dateString) {
    const d = daysUntil(dateString);
    if (d === null) return '';
    if (d < 0) return `<span class="badge text-bg-danger">Vencido há ${-d} dia(s)</span>`;
    if (d === 0) return '<span class="badge text-bg-danger">Vence hoje</span>';
    if (d <= EXPIRING_DAYS) return `<span class="badge text-bg-warning">Vence em ${d} dia(s)</span>`;
    return '<span class="badge text-bg-success">Dentro da validade</span>';
}

// ---------- Autenticação ----------
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        userEmailDisplay.textContent = user.displayName || user.email;
        loadFoods();
    } else {
        if (unsubscribeFoods) { unsubscribeFoods(); unsubscribeFoods = null; }
        window.location.href = 'index.html';
    }
});

if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Erro ao sair:", error);
            showToast("Não foi possível sair. Tente novamente.", 'danger');
        }
    });
}

// ---------- Adicionar ----------
if (addFoodForm) {
    addFoodForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('foodName').value.trim();
        const quantity = parseInt(document.getElementById('foodQuantity').value, 10);
        const expiration = document.getElementById('foodExpiration').value;

        if (!name || isNaN(quantity) || quantity < 1 || !parseDate(expiration)) {
            showToast("Preencha nome, quantidade (≥ 1) e uma validade válida.", 'warning');
            return;
        }

        try {
            // Evita duplicados: mesmo nome e mesma validade somam a quantidade
            const existing = currentFoods.find(f =>
                normalize(f.nome) === normalize(name) && f.validade === expiration);

            if (existing) {
                await updateDoc(doc(db, "alimentos", existing.id), {
                    quantidade: existing.quantidade + quantity
                });
                showToast(`Quantidade de "${existing.nome}" atualizada.`);
            } else {
                await addDoc(collection(db, "alimentos"), {
                    userId: currentUser.uid,
                    nome: name,
                    quantidade: quantity,
                    validade: expiration
                });
                showToast("Alimento adicionado.");
            }
            addFoodForm.reset();
        } catch (error) {
            console.error("Erro ao adicionar alimento:", error);
            showToast("Erro ao adicionar alimento.", 'danger');
        }
    });
}

// ---------- Listar ----------
function loadFoods() {
    if (unsubscribeFoods) unsubscribeFoods();

    const q = query(collection(db, "alimentos"), where("userId", "==", currentUser.uid));

    unsubscribeFoods = onSnapshot(q, (snapshot) => {
        currentFoods = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        // Ordena por validade: o que vence primeiro fica no topo
        currentFoods.sort((a, b) => String(a.validade).localeCompare(String(b.validade)));
        renderFoods();
        updateAlerts();
    }, (error) => {
        console.error("Erro ao carregar alimentos:", error);
        showToast("Erro ao carregar seus alimentos.", 'danger');
    });
}

function renderFoods() {
    const term = normalize(searchInput ? searchInput.value : '');
    const visible = currentFoods.filter(f => !term || normalize(f.nome).includes(term));

    foodList.innerHTML = '';

    if (visible.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        td.className = 'text-center text-muted py-4';
        td.textContent = currentFoods.length === 0
            ? 'Sua despensa está vazia. Adicione um alimento ao lado.'
            : 'Nenhum alimento encontrado para essa busca.';
        tr.appendChild(td);
        foodList.appendChild(tr);
        return;
    }

    visible.forEach((food) => {
        const tr = document.createElement('tr');
        if (checkExpired(food.validade)) tr.classList.add('table-danger');
        else if (checkExpiring(food.validade)) tr.classList.add('table-warning');

        const nome = escapeHtml(food.nome);
        tr.innerHTML = `
            <td></td>
            <td>${escapeHtml(food.quantidade)}</td>
            <td>${formatDateBr(food.validade)}</td>
            <td>${statusBadge(food.validade)}</td>
            <td class="text-nowrap">
                <button type="button" class="btn btn-sm btn-outline-secondary" data-action="consume" data-id="${escapeHtml(food.id)}" aria-label="Consumir uma unidade de ${nome}" title="Consumir 1 unidade">
                    <i class="bi bi-dash-circle"></i>
                </button>
                <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit" data-id="${escapeHtml(food.id)}" aria-label="Editar ${nome}" title="Editar">
                    <i class="bi bi-pencil"></i>
                </button>
                <button type="button" class="btn btn-sm btn-danger" data-action="delete" data-id="${escapeHtml(food.id)}" aria-label="Excluir ${nome}" title="Excluir">
                    <i class="bi bi-trash"></i>
                </button>
            </td>`;
        tr.firstElementChild.textContent = food.nome; // seguro contra XSS
        foodList.appendChild(tr);
    });
}

if (searchInput) searchInput.addEventListener('input', renderFoods);

// Delegação de eventos (sem onclick inline)
if (foodList) {
    foodList.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const food = currentFoods.find(f => f.id === btn.dataset.id);
        if (!food) return;

        if (btn.dataset.action === 'delete') removeFood(food);
        else if (btn.dataset.action === 'consume') consumeFood(food);
        else if (btn.dataset.action === 'edit') openEditModal(food);
    });
}

// ---------- Remover / consumir / editar ----------
async function removeFood(food) {
    if (!confirm(`Tem certeza que deseja remover "${food.nome}"?`)) return;
    try {
        await deleteDoc(doc(db, "alimentos", food.id));
        showToast("Alimento removido.");
    } catch (error) {
        console.error("Erro ao remover alimento:", error);
        showToast("Erro ao remover alimento.", 'danger');
    }
}

async function consumeFood(food) {
    try {
        if (food.quantidade <= 1) {
            if (!confirm(`Essa é a última unidade de "${food.nome}". Remover da despensa?`)) return;
            await deleteDoc(doc(db, "alimentos", food.id));
        } else {
            await updateDoc(doc(db, "alimentos", food.id), { quantidade: food.quantidade - 1 });
        }
    } catch (error) {
        console.error("Erro ao consumir alimento:", error);
        showToast("Erro ao atualizar a quantidade.", 'danger');
    }
}

let editingId = null;

function openEditModal(food) {
    editingId = food.id;
    document.getElementById('editFoodName').value = food.nome;
    document.getElementById('editFoodQuantity').value = food.quantidade;
    document.getElementById('editFoodExpiration').value = food.validade;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('editFoodModal')).show();
}

if (editFoodForm) {
    editFoodForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('editFoodName').value.trim();
        const quantity = parseInt(document.getElementById('editFoodQuantity').value, 10);
        const expiration = document.getElementById('editFoodExpiration').value;

        if (!editingId || !name || isNaN(quantity) || quantity < 1 || !parseDate(expiration)) {
            showToast("Dados inválidos.", 'warning');
            return;
        }

        try {
            await updateDoc(doc(db, "alimentos", editingId), {
                nome: name,
                quantidade: quantity,
                validade: expiration
            });
            bootstrap.Modal.getInstance(document.getElementById('editFoodModal')).hide();
            showToast("Alimento atualizado.");
        } catch (error) {
            console.error("Erro ao editar alimento:", error);
            showToast("Erro ao editar alimento.", 'danger');
        }
    });
}

// ---------- Alertas ----------
function addAlert(type, title, foods) {
    const alertEl = document.createElement('div');
    alertEl.className = `alert alert-${type} alert-dismissible fade show`;
    alertEl.setAttribute('role', 'alert');

    const strong = document.createElement('strong');
    strong.textContent = title + ' ';
    alertEl.appendChild(strong);
    alertEl.appendChild(document.createTextNode(foods.map(f => f.nome).join(', ') + '.'));

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn-close';
    close.setAttribute('data-bs-dismiss', 'alert');
    close.setAttribute('aria-label', 'Fechar');
    alertEl.appendChild(close);

    alertsContainer.appendChild(alertEl);
}

function updateAlerts() {
    alertsContainer.innerHTML = '';

    const expiringFoods = currentFoods.filter(f => checkExpiring(f.validade));
    const expiredFoods = currentFoods.filter(f => checkExpired(f.validade));

    if (expiringFoods.length > 0) {
        addAlert('warning',
            `Atenção! ${expiringFoods.length} alimento(s) vencem em até ${EXPIRING_DAYS} dias:`,
            expiringFoods);
    }
    if (expiredFoods.length > 0) {
        addAlert('danger',
            `Cuidado! ${expiredFoods.length} alimento(s) já vencido(s):`,
            expiredFoods);
    }
}

// ---------- Sugestão de receitas ----------
const dbReceitas = [
    { nome: "Macarronada Simples", ingredientes: ["macarrão", "molho de tomate", "cebola", "alho"] },
    { nome: "Arroz com Feijão", ingredientes: ["arroz", "feijão", "alho", "óleo"] },
    { nome: "Omelete", ingredientes: ["ovo", "sal", "óleo", "queijo"] },
    { nome: "Bolo de Cenoura", ingredientes: ["cenoura", "ovo", "farinha de trigo", "açúcar", "óleo", "fermento"] },
    { nome: "Salada Básica", ingredientes: ["alface", "tomate", "cebola", "sal", "azeite"] },
    { nome: "Sanduíche Natural", ingredientes: ["pão de forma", "maionese", "cenoura", "alface", "tomate"] }
];

function words(text) {
    return normalize(text).split(/\s+/).filter(Boolean).map(w => w.replace(/(s|es)$/, ''));
}

function hasIngredient(foodNames, ingredient) {
    const ingWords = words(ingredient);
    return foodNames.some(food => {
        const foodWords = words(food);
        return ingWords.every(w => foodWords.includes(w)) || foodWords.every(w => ingWords.includes(w));
    });
}

if (btnSuggestRecipes) {
    btnSuggestRecipes.addEventListener('click', () => {
        const foodNames = currentFoods.map(f => f.nome);
        // Alimentos perto de vencer têm prioridade
        const urgentNames = currentFoods
            .filter(f => checkExpiring(f.validade) || checkExpired(f.validade))
            .map(f => f.nome);

        const suggestions = dbReceitas
            .map(rec => {
                const available = rec.ingredientes.filter(ing => hasIngredient(foodNames, ing));
                const urgent = rec.ingredientes.filter(ing => hasIngredient(urgentNames, ing));
                return { rec, available, urgent };
            })
            .filter(s => s.available.length >= 2)
            .sort((a, b) =>
                b.urgent.length - a.urgent.length ||
                (b.available.length / b.rec.ingredientes.length) - (a.available.length / a.rec.ingredientes.length));

        recipesList.innerHTML = '';

        if (suggestions.length === 0) {
            recipesList.innerHTML = '<div class="col-12"><p class="text-muted">Nenhuma receita encontrada com seus ingredientes atuais.</p></div>';
        } else {
            suggestions.forEach(({ rec, available, urgent }) => {
                const col = document.createElement('div');
                col.className = 'col-md-6 mb-3';

                const ingrHtml = rec.ingredientes.map(ing => {
                    const ok = available.includes(ing);
                    return ok
                        ? `<span class="text-success"><i class="bi bi-check-circle"></i> ${escapeHtml(ing)}</span>`
                        : `<span class="text-danger"><i class="bi bi-x-circle"></i> ${escapeHtml(ing)}</span>`;
                }).join('<br>');

                const pct = Math.round((available.length / rec.ingredientes.length) * 100);
                const urgentBadge = urgent.length > 0
                    ? `<span class="badge text-bg-warning ms-2">Usa itens perto de vencer</span>` : '';

                col.innerHTML = `
                    <div class="card h-100 border-success">
                        <div class="card-header bg-success text-white">${escapeHtml(rec.nome)}${urgentBadge}</div>
                        <div class="card-body">
                            <h6>Ingredientes (${pct}% disponíveis):</h6>
                            <p class="mb-0" style="font-size: 0.9rem;">${ingrHtml}</p>
                        </div>
                    </div>`;
                recipesList.appendChild(col);
            });
        }

        bootstrap.Modal.getOrCreateInstance(document.getElementById('recipesModal')).show();
    });
}
