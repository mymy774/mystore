import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import { doc, setDoc, serverTimestamp, onSnapshot } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import { auth, db } from './firebase.js';
import { el, aviso, consultarPerfil, mensagemErro, irParaPerfil } from './util.js';

let cadastrando = false;
let pararEscuta = null;

function aba(tipo) {
  const login = tipo === 'login';
  el('secaoCadastro').hidden = login;
  el('secaoLogin').hidden = !login;
  el('abaCadastro').classList.toggle('active', !login);
  el('abaLogin').classList.toggle('active', login);
  el('abaCadastro').setAttribute('aria-selected', String(!login));
  el('abaLogin').setAttribute('aria-selected', String(login));
}

function mostrarAguardando(titulo, texto) {
  el('formularios').hidden = true;
  el('aguardando').hidden = false;
  el('tituloStatus').textContent = titulo;
  el('textoStatus').textContent = texto;
}

function mostrarFormularios() {
  el('formularios').hidden = false;
  el('aguardando').hidden = true;
}

function ligarObservador(usuario) {
  if (pararEscuta) pararEscuta();

  pararEscuta = onSnapshot(
    doc(db, 'usuarios', usuario.uid),
    async (snapshot) => {
      if (!auth.currentUser || auth.currentUser.uid !== usuario.uid) return;

      if (!snapshot.exists()) {
        mostrarAguardando(
          'Cadastro incompleto',
          'A conta existe, mas a solicitação não foi registrada. Procure o administrador.'
        );
        return;
      }

      const dados = snapshot.data();

      if (dados.status === 'aprovado') {
        irParaPerfil({ dados });
      } else if (dados.status === 'recusado') {
        mostrarAguardando(
          'Solicitação recusada',
          'Procure o administrador para mais informações.'
        );
      } else {
        mostrarAguardando(
          'Em análise',
          'Seu cadastro está aguardando a decisão de um administrador.'
        );
      }
    },
    (erro) => aviso(mensagemErro(erro))
  );
}

el('abaCadastro').addEventListener('click', () => aba('cadastro'));
el('abaLogin').addEventListener('click', () => aba('login'));

el('sair').addEventListener('click', async () => {
  await signOut(auth);
  mostrarFormularios();
  aba('login');
});

el('formCadastro').addEventListener('submit', async (evento) => {
  evento.preventDefault();

  if (cadastrando) return;

  cadastrando = true;
  el('enviarCadastro').disabled = true;
  aviso('Criando conta e registrando sua solicitação...');

  let contaCriada = false;

  try {
    const nome = el('nome').value.trim();
    const telefone = el('telefone').value.trim();
    const cidade = el('cidade').value.trim();
    const endereco = el('endereco').value.trim();
    const email = el('email').value.trim().toLowerCase();
    const senha = el('senha').value;

    const indicador = {
      nome: el('indicadorNome').value.trim(),
      email: el('indicadorEmail').value.trim().toLowerCase(),
      telefone: el('indicadorTelefone').value.trim()
    };

    if (
      nome.length < 2 ||
      cidade.length < 2 ||
      telefone.length < 8 ||
      indicador.nome.length < 2 ||
      indicador.telefone.length < 8
    ) {
      throw new Error(
        'Confira nome, telefone, cidade e dados de indicação.'
      );
    }

    const credencial = await createUserWithEmailAndPassword(
      auth,
      email,
      senha
    );

    contaCriada = true;

    await setDoc(doc(db, 'usuarios', credencial.user.uid), {
      nome,
      telefone,
      cidade,
      endereco,
      email,
      indicador,
      funcao: 'cliente',
      status: 'pendente',
      criadoEm: serverTimestamp()
    });

    await sendEmailVerification(credencial.user);

    aviso(
      'Conta criada. Confira seu e-mail, verifique a conta e aguarde a aprovação do ADM.'
    );

    el('formCadastro').reset();
    aba('login');

  } catch (erro) {
    aviso(
      contaCriada
        ? 'A conta foi criada, mas uma etapa falhou. Entre novamente e consulte o administrador caso a solicitação não apareça.'
        : (
          erro.message?.startsWith('Confira')
            ? erro.message
            : mensagemErro(erro)
        )
    );

  } finally {
    el('senha').value = '';
    await signOut(auth).catch(console.error);
    cadastrando = false;
    el('enviarCadastro').disabled = false;
  }
});

el('formLogin').addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const botao = el('botaoEntrar');
  botao.disabled = true;

  aviso('Verificando conta...');

  try {
    await signInWithEmailAndPassword(
      auth,
      el('loginEmail').value.trim().toLowerCase(),
      el('loginSenha').value
    );

  } catch (erro) {
    aviso(mensagemErro(erro));

  } finally {
    el('loginSenha').value = '';
    botao.disabled = false;
  }
});

el('recuperar').addEventListener('click', async () => {
  const email = el('loginEmail').value.trim();

  if (!email) {
    aviso('Digite seu e-mail na área Entrar primeiro.');
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);

    aviso(
      'Se o e-mail estiver cadastrado, você receberá instruções para recuperar a senha.'
    );

  } catch (erro) {
    aviso(mensagemErro(erro));
  }
});

el('reenviar').addEventListener('click', async () => {
  try {
    if (!auth.currentUser) {
      aviso('Entre com sua conta para reenviar a verificação.');
      return;
    }

    await sendEmailVerification(auth.currentUser);
    aviso('Verificação enviada. Confira seu e-mail.');

  } catch (erro) {
    aviso(mensagemErro(erro));
  }
});

onAuthStateChanged(auth, async (usuario) => {
  if (pararEscuta) {
    pararEscuta();
    pararEscuta = null;
  }

  if (!usuario || cadastrando) return;

  try {
    const perfil = await consultarPerfil(usuario);

    if (
      !auth.currentUser ||
      auth.currentUser.uid !== usuario.uid
    ) return;

    if (perfil.tipo === 'email') {
      aviso(
        'Verifique seu e-mail, depois atualize a página. Você também pode reenviar o e-mail de verificação.'
      );

      mostrarFormularios();
      aba('login');
      return;
    }

    if (perfil.tipo === 'sem-perfil') {
      mostrarAguardando(
        'Cadastro incompleto',
        'O administrador precisa regularizar sua solicitação.'
      );
      return;
    }

    ligarObservador(usuario);

  } catch (erro) {
    aviso(mensagemErro(erro));
  }
});
