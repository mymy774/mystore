import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import { reload } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import { db } from './firebase.js';

export const el = (id) => document.getElementById(id);

export const perfisEquipe = new Set([
  'ADM',
  'vendedor',
  'atendimento',
  'entregador',
  'separacao',
  'estoquista',
  'afiliado'
]);

export function dinheiro(centavos) {
  if (!Number.isSafeInteger(centavos) || centavos < 0) {
    return 'Preço indisponível';
  }

  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

export function aviso(texto, id = 'mensagem') {
  const elemento = el(id);
  if (elemento) elemento.textContent = texto;
}

export async function consultarPerfil(usuario) {
  await reload(usuario);
  await usuario.getIdToken(true);

  if (!usuario.emailVerified) {
    return { tipo: 'email' };
  }

  const resultado = await getDoc(
    doc(db, 'usuarios', usuario.uid)
  );

  if (!resultado.exists()) {
    return { tipo: 'sem-perfil' };
  }

  const dados = resultado.data();

  return {
    tipo: dados.status === 'aprovado'
      ? 'aprovado'
      : (dados.status || 'pendente'),
    dados
  };
}

export function mensagemErro(erro) {
  console.error('Falha na My Store:', erro);

  const cod = erro?.code || '';

  if (cod === 'auth/email-already-in-use') {
    return 'Já existe uma conta com esse e-mail. Use Entrar ou recuperar senha.';
  }

  if (cod === 'auth/weak-password') {
    return 'Escolha uma senha mais forte.';
  }

  if (cod === 'auth/too-many-requests') {
    return 'Muitas tentativas. Tente mais tarde.';
  }

  if (cod === 'permission-denied') {
    return 'Acesso negado. Confira as permissões antes de publicar.';
  }

  return 'Não foi possível concluir. Verifique sua conexão e tente novamente.';
}

export function irParaPerfil(perfil) {
  if (perfil.dados?.funcao === 'cliente') {
    window.location.replace('./catalogo.html');
  } else if (perfisEquipe.has(perfil.dados?.funcao)) {
    window.location.replace('./painel.html');
  }
}

export function criarTexto(tag, texto, classe = '') {
  const item = document.createElement(tag);
  item.textContent = texto;

  if (classe) item.className = classe;

  return item;
}
