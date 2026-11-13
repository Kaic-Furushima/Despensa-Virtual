import { auth } from './firebase-config.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";

// DOM Elements
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginError = document.getElementById('loginError');
const registerError = document.getElementById('registerError');
const btnResetPassword = document.getElementById('btnResetPassword');

// Evita redirecionar duas vezes (observer + submit) e durante o cadastro,
// quando o displayName ainda está sendo gravado.
let registering = false;

const ERROR_MESSAGES = {
    'auth/invalid-email': 'E-mail inválido.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-disabled': 'Esta conta foi desativada.',
    'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
    'auth/weak-password': 'A senha deve ter pelo menos 6 caracteres.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente novamente.',
    'auth/network-request-failed': 'Falha de conexão. Verifique sua internet.',
    'auth/missing-email': 'Informe o e-mail.'
};

function friendlyError(error) {
    return ERROR_MESSAGES[error.code] || 'Ocorreu um erro inesperado. Tente novamente.';
}

function showError(el, message) {
    el.textContent = message;
    el.classList.remove('text-success');
    el.classList.add('text-danger');
    el.classList.remove('d-none');
}

// Redireciona usuários já logados (a página é sempre o index de login)
onAuthStateChanged(auth, (user) => {
    if (user && !registering) {
        window.location.replace('dashboard.html');
    }
});

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.classList.add('d-none');
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;

        try {
            // O onAuthStateChanged cuida do redirecionamento
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            console.error(error);
            showError(loginError, friendlyError(error));
        }
    });
}

if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        registerError.classList.add('d-none');
        const name = document.getElementById('registerName').value.trim();
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value;

        registering = true;
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCredential.user, { displayName: name });
            window.location.replace('dashboard.html');
        } catch (error) {
            registering = false;
            console.error(error);
            showError(registerError, friendlyError(error));
        }
    });
}

if (btnResetPassword) {
    btnResetPassword.addEventListener('click', async () => {
        const email = document.getElementById('loginEmail').value.trim();
        if (!email) {
            showError(loginError, 'Digite seu e-mail no campo acima para recuperar a senha.');
            return;
        }
        try {
            await sendPasswordResetEmail(auth, email);
            loginError.textContent = 'Enviamos um e-mail para redefinir sua senha, se a conta existir.';
            loginError.classList.remove('text-danger', 'd-none');
            loginError.classList.add('text-success');
        } catch (error) {
            console.error(error);
            showError(loginError, friendlyError(error));
        }
    });
}
