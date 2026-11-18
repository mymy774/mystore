import { onAuthStateChanged, signOut, reload } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import { collection, doc, onSnapshot, query, where } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import { auth, db } from './firebase.js';
import { el, aviso, dinheiro, criarTexto, mensagemErro } from './util.js';

let desligarPerfil = null;
let desligarProdutos = null;
let desligarLoja = null;

function limpar() {
  if (desligarPerfil) desligarPerfil();
  if (desligarProdutos) desligarProdutos();
  if (desligarLoja) desligarLoja();

  desligarPerfil = desligarProdutos = desligarLoja = null;
  el('conteudo').hidden = true;
  el('listaProdutos').replaceChildren();
}

function produtos() {
  if (desligarProdutos) return;

  const consulta = query(
    collection(db, 'produtos'),
    where('ativo', '==', true)
  );

  desligarProdutos = onSnapshot(consulta, (resultado) => {
    const lista = el('listaProdutos');
    lista.replaceChildren();

    if (resultado.empty) {
      lista.textContent = 'Nenhum produto ativo no momento.';
      return;
    }

    resultado.forEach((documento) => {
      const dados = documento.data();
      const item = document.createElement('article');

      item.className = 'product-card';

      item.append(
        criarTexto('h3', dados.nome || 'Produto'),
        criarTexto('p', dinheiro(dados.preco_centavos), 'price')
      );

      lista.append(item);
    });
  }, (erro) => {
    el('listaProdutos').replaceChildren();
    aviso(mensagemErro(erro));
  });
}

function estadoLoja() {
  if (desligarLoja) return;

  desligarLoja = onSnapshot(
    doc(db, 'configuracoes', 'loja'),
    (snapshot) => {
      const aberta = snapshot.exists() &&
        snapshot.data().aberta === true;

      el('avisoLoja').textContent = aberta
        ? 'Estamos atendendo. Este catálogo ainda não recebe pedidos.'
        : 'Estamos fechados no momento, mas em breve vamos atender. O catálogo pode ser consultado.';
    },
    (erro) => {
      el('avisoLoja').textContent =
        'Não foi possível consultar o atendimento.';
      console.error(erro);
    }
  );
}

el('sair').addEventListener('click', async () => {
  await signOut(auth);
  window.location.replace('./index.html');
});

onAuthStateChanged(auth, async (usuario) => {
  limpar();

  if (!usuario) {
    window.location.replace('./index.html');
    return;
  }

  try {
    await reload(usuario);
    await usuario.getIdToken(true);

    if (!usuario.emailVerified) {
      aviso('Verifique seu e-mail para entrar no catálogo.');
      return;
    }

    desligarPerfil = onSnapshot(
      doc(db, 'usuarios', usuario.uid),
      (snapshot) => {
        if (
          !auth.currentUser ||
          auth.currentUser.uid !== usuario.uid
        ) return;

        const perfil = snapshot.data();

        const autorizado = snapshot.exists() &&
          perfil.status === 'aprovado' &&
          perfil.funcao === 'cliente';

        if (!autorizado) {
          if (desligarProdutos) {
            desligarProdutos();
            desligarProdutos = null;
          }

          if (desligarLoja) {
            desligarLoja();
            desligarLoja = null;
          }

          el('listaProdutos').replaceChildren();
          el('conteudo').hidden = true;

          aviso(
            'Sua conta não está liberada para o catálogo. Consulte a página de entrada.'
          );
          return;
        }

        el('conteudo').hidden = false;

        el('boasVindas').textContent =
          'Bem-vindo(a), ' + (perfil.nome || 'cliente') + '.';

        aviso('Acesso aprovado. Produtos disponíveis para consulta.');

        produtos();
        estadoLoja();
      },
      (erro) => {
        limpar();
        aviso(mensagemErro(erro));
      }
    );
  } catch (erro) {
    limpar();
    aviso(mensagemErro(erro));
  }
});
