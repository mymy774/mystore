import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';

import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';

import { auth, db } from './firebase.js';

import {
  el,
  aviso,
  consultarPerfil,
  criarTexto,
  dinheiro,
  mensagemErro,
  perfisEquipe
} from './util.js';

let funcao = null;
let aberta = false;
let statusCarregado = false;
let produtoEditando = null;
let produtosAtuais = new Map();

const observadores = [];

const podeOperar = (papel) =>
  ['ADM', 'vendedor', 'atendimento'].includes(papel);

const formatarData = (timestamp) =>
  timestamp?.toDate?.().toLocaleString('pt-BR') ||
  'Ainda não registrado';

// Limpa os dados e observadores ao sair ou trocar de conta.
function limpar() {
  observadores.splice(0).forEach((cancelar) => cancelar());

  el('conteudo').hidden = true;
  funcao = null;
  statusCarregado = false;
  el('alternarLoja').disabled = true;
  produtoEditando = null;
  produtosAtuais.clear();

  for (const id of [
    'areaLoja',
    'areaXicara',
    'areaAprovacoes',
    'areaProdutos',
    'areaHistorico'
  ]) {
    el(id).hidden = true;
  }
}

function criarBotao(texto, acao, classe = 'secondary') {
  const botao = document.createElement('button');

  botao.type = 'button';
  botao.textContent = texto;
  botao.className = classe;
  botao.addEventListener('click', acao);

  return botao;
}

// Atualiza a xícara exclusiva do administrador.
function atualizarXicara() {
  el('xicara').classList.toggle('aberta', aberta);
  el('xicara').classList.toggle('fechada', !aberta);

  el('xicara').setAttribute(
    'aria-label',
    aberta
      ? 'Loja aberta: chá verde com vapor'
      : 'Loja fechada: chá preto sem vapor'
  );
}

// Acompanha o estado da loja em tempo real.
function ouvirLoja() {
  const cancelar = onSnapshot(
    doc(db, 'configuracoes', 'loja'),
    (resultado) => {
      const dados = resultado.exists()
        ? resultado.data()
        : null;

      aberta = dados?.aberta === true;
      statusCarregado = true;

      el('estadoLoja').textContent = aberta
        ? 'Loja aberta'
        : 'Loja fechada';

      el('atualizacaoLoja').textContent = dados
        ? Última mudança: ${formatarData(dados.alteradoEm)} · usuário ${dados.alteradoPor}
        : 'Nenhum histórico de abertura registrado ainda.';

      el('alternarLoja').textContent = aberta
        ? 'Fechar loja'
        : 'Abrir loja';

      el('alternarLoja').disabled = false;

      if (funcao === 'ADM') {
        atualizarXicara();
      }
    },
    (erro) => aviso(mensagemErro(erro))
  );

  observadores.push(cancelar);
}

// Abre ou fecha a loja e registra a alteração.
async function alternarLoja() {
  if (
    !podeOperar(funcao) ||
    !auth.currentUser ||
    !statusCarregado
  ) {
    return;
  }

  const botao = el('alternarLoja');
  botao.disabled = true;

  aviso('Registrando alteração com histórico...');

  const uid = auth.currentUser.uid;

  try {
    const lojaRef = doc(db, 'configuracoes', 'loja');
    const eventoRef = doc(collection(db, 'historico_loja'));

    await runTransaction(db, async (transacao) => {
      const atual = await transacao.get(lojaRef);

      const anterior = atual.exists()
        ? atual.data().aberta === true
        : false;

      const proxima = !anterior;

      const versao = atual.exists()
        ? atual.data().versao + 1
        : 1;

      const agora = serverTimestamp();

      transacao.set(eventoRef, {
        eventoId: eventoRef.id,
        abertaAntes: anterior,
        abertaDepois: proxima,
        alteradoEm: agora,
        alteradoPor: uid,
        versao
      });

      transacao.set(lojaRef, {
        aberta: proxima,
        alteradoEm: agora,
        alteradoPor: uid,
        eventoId: eventoRef.id,
        versao
      });
    });

    aviso('Estado alterado e histórico registrado.');
  } catch (erro) {
    aviso(mensagemErro(erro));
  } finally {
    if (statusCarregado) {
      botao.disabled = false;
    }
  }
}

// Carrega os cadastros de clientes pendentes.
function ouvirPendentes() {
  const consulta = query(
    collection(db, 'usuarios'),
    where('status', '==', 'pendente')
  );

  const cancelar = onSnapshot(
    consulta,
    (resultado) => {
      const lista = el('listaPendentes');
      lista.replaceChildren();

      if (resultado.empty) {
        lista.textContent = 'Nenhuma solicitação pendente.';
        return;
      }

      resultado.forEach((registro) => {
        const dados = registro.data();

        if (dados.funcao !== 'cliente') return;

        const artigo = document.createElement('article');
        artigo.className = 'request-item';

        artigo.append(
          criarTexto('h3', dados.nome || 'Sem nome'),
          criarTexto(
            'p',
            E-mail: ${dados.email || 'Não informado'}
          ),
          criarTexto(
            'p',
            WhatsApp: ${dados.telefone || 'Não informado'}
          ),
          criarTexto(
            'p',
            Cidade: ${dados.cidade || 'Não informada'}
          ),
          criarTexto(
            'p',
            Endereço: ${dados.endereco || 'Não informado'}
          ),
          criarTexto(
            'p',
            Indicação: ${dados.indicador?.nome || 'Não informada'} · ${dados.indicador?.email || ''} · ${dados.indicador?.telefone || ''}
          )
        );

        const acoes = document.createElement('div');
        acoes.className = 'button-row';

        acoes.append(
          criarBotao(
            'Aprovar',
            () => decidirCadastro(registro.id, 'aprovado'),
            'primary'
          ),
          criarBotao(
            'Recusar',
            () => decidirCadastro(registro.id, 'recusado')
          )
        );

        artigo.append(acoes);
        lista.append(artigo);
      });

      if (!lista.childNodes.length) {
        lista.textContent =
          'Nenhum cadastro de cliente pendente.';
      }
    },
    (erro) => aviso(mensagemErro(erro))
  );

  observadores.push(cancelar);
}

// Permite ao ADM aprovar ou recusar clientes.
async function decidirCadastro(uid, decisao) {
  if (funcao !== 'ADM' || !auth.currentUser) return;

  const mensagem = decisao === 'aprovado'
    ? 'Aprovar este cadastro?'
    : 'Recusar este cadastro?';

  if (!window.confirm(mensagem)) return;

  try {
    await updateDoc(doc(db, 'usuarios', uid), {
      status: decisao,
      revisadoPor: auth.currentUser.uid,
      revisadoEm: serverTimestamp()
    });

    aviso('Solicitação atualizada com sucesso.');
  } catch (erro) {
    aviso(mensagemErro(erro));
  }
}

// Exibe o histórico de abertura e fechamento.
function ouvirHistorico() {
  const consulta = query(
    collection(db, 'historico_loja'),
    orderBy('alteradoEm', 'desc'),
    limit(30)
  );

  const cancelar = onSnapshot(
    consulta,
    (resultado) => {
      const lista = el('listaHistorico');
      lista.replaceChildren();

      if (resultado.empty) {
        lista.textContent = 'Sem alterações registradas.';
        return;
      }

      resultado.forEach((registro) => {
        const dados = registro.data();

        lista.append(
          criarTexto(
            'p',
            ${formatarData(dados.alteradoEm)} · ${dados.abertaDepois ? 'Abriu' : 'Fechou'} · usuário ${dados.alteradoPor}
          )
        );
      });
    },
    (erro) => aviso(mensagemErro(erro))
  );

  observadores.push(cancelar);
}

// Converte preços digitados em reais para centavos.
function centavos(texto) {
  const valor = texto.trim();

  if (!/^\d{1,6}([.,]\d{1,2})?$/.test(valor)) {
    return null;
  }

  const [inteiros, frac = ''] =
    valor.replace(',', '.').split('.');

  return (
    Number(inteiros) * 100 +
    Number(frac.padEnd(2, '0'))
  );
}

function limparFormProduto() {
  produtoEditando = null;

  el('formProduto').reset();
  el('produtoAtivo').checked = true;
  el('produtoEstoque').value = '0';
  el('produtoMinimo').value = '0';

  el('salvarProduto').textContent = 'Cadastrar produto';
  el('cancelarEdicao').hidden = true;
}

// Exibe os produtos no painel administrativo.
function ouvirProdutosAdmin() {
  const cancelar = onSnapshot(
    collection(db, 'produtos'),
    (resultado) => {
      const lista = el('listaGestaoProdutos');

      lista.replaceChildren();
      produtosAtuais.clear();

      if (resultado.empty) {
        lista.textContent = 'Nenhum produto cadastrado.';
        return;
      }

      resultado.forEach((registro) => {
        const dados = registro.data();

        produtosAtuais.set(registro.id, dados);

        const artigo = document.createElement('article');
        artigo.className = 'request-item';

        artigo.append(
          criarTexto('h3', dados.nome || 'Produto'),
          criarTexto(
            'p',
            ${dinheiro(dados.preco_centavos)} · ${dados.ativo ? 'Ativo' : 'Inativo'} · Estoque: ${dados.estoque ?? 'não definido'} · Mínimo: ${dados.estoque_minimo ?? 'não definido'}
          ),
          criarBotao(
            'Editar',
            () => editarProduto(registro.id)
          )
        );

        lista.append(artigo);
      });
    },
    (erro) => aviso(mensagemErro(erro))
  );

  observadores.push(cancelar);
}

// Preenche o formulário para editar um produto.
function editarProduto(id) {
  if (funcao !== 'ADM') return;

  const dados = produtosAtuais.get(id);
  if (!dados) return;

  produtoEditando = id;

  el('produtoNome').value = dados.nome || '';

  el('produtoPreco').value =
    Number.isSafeInteger(dados.preco_centavos)
      ? (dados.preco_centavos / 100)
          .toFixed(2)
          .replace('.', ',')
      : '';

  el('produtoEstoque').value =
    String(dados.estoque ?? 0);

  el('produtoMinimo').value =
    String(dados.estoque_minimo ?? 0);

  el('produtoAtivo').checked =
    dados.ativo === true;

  el('salvarProduto').textContent = 'Salvar alterações';
  el('cancelarEdicao').hidden = false;

  el('formProduto').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

// Cadastra ou atualiza produtos.
async function salvarProduto(evento) {
  evento.preventDefault();

  if (funcao !== 'ADM') return;

  const nome = el('produtoNome').value.trim();
  const preco = centavos(el('produtoPreco').value);
  const estoque = Number(el('produtoEstoque').value);
  const minimo = Number(el('produtoMinimo').value);

  if (
    nome.length < 2 ||
    preco === null ||
    !Number.isSafeInteger(estoque) ||
    estoque < 0 ||
    estoque > 1000000 ||
    !Number.isSafeInteger(minimo) ||
    minimo < 0 ||
    minimo > 1000000
  ) {
    aviso(
      'Confira o nome, o preço (exemplo 19,90) e as quantidades inteiras.'
    );
    return;
  }

  const dados = {
    nome,
    preco_centavos: preco,
    estoque,
    estoque_minimo: minimo,
    ativo: el('produtoAtivo').checked,
    atualizadoEm: serverTimestamp()
  };

  const botao = el('salvarProduto');
  botao.disabled = true;

  try {
    if (produtoEditando) {
      await updateDoc(
        doc(db, 'produtos', produtoEditando),
        dados
      );
    } else {
      await addDoc(collection(db, 'produtos'), {
        ...dados,
        criadoEm: serverTimestamp()
      });
    }

    limparFormProduto();
    aviso('Produto salvo com sucesso.');
  } catch (erro) {
    aviso(mensagemErro(erro));
  } finally {
    botao.disabled = false;
  }
}

// Eventos dos botões do painel.
el('sair').addEventListener('click', async () => {
  await signOut(auth);
  window.location.replace('./index.html');
});

el('alternarLoja').addEventListener(
  'click',
  alternarLoja
);

el('formProduto').addEventListener(
  'submit',
  salvarProduto
);

el('cancelarEdicao').addEventListener(
  'click',
  limparFormProduto
);

// Verifica autenticação, aprovação e permissões.
onAuthStateChanged(auth, async (usuario) => {
  limpar();

  if (!usuario) {
    window.location.replace('./index.html');
    return;
  }

  try {
    const perfil = await consultarPerfil(usuario);

    if (
      !auth.currentUser ||
      auth.currentUser.uid !== usuario.uid
    ) {
      return;
    }

    if (
      perfil.tipo !== 'aprovado' ||
      !perfisEquipe.has(perfil.dados.funcao)
    ) {
      aviso(
        'Acesso não autorizado. Volte para casa!!!.'
      );
      return;
    }

    funcao = perfil.dados.funcao;

    const vigiarPerfil = onSnapshot(
      doc(db, 'usuarios', usuario.uid),
      (resultado) => {
        const dadosAtuais = resultado.data();

        if (
          !resultado.exists() ||
          dadosAtuais.status !== 'aprovado' ||
          dadosAtuais.funcao !== funcao
        ) {
          limpar();

          aviso(
            'Seu acesso foi alterado. Reentre para verificar as permissões.'
          );
        }
      },
      (erro) => {
        limpar();
        aviso(mensagemErro(erro));
      }
    );

    observadores.push(vigiarPerfil);

    el('identificacao').textContent =
      ${perfil.dados.nome || usuario.email} · ${funcao};

    el('conteudo').hidden = false;

    aviso(
      'Acesso autorizado às funções do seu perfil.'
    );

    for (
      const item of document.querySelectorAll(
        '[data-funcoes]'
      )
    ) {
      item.hidden = !item.dataset.funcoes
        .split(',')
        .includes(funcao);
    }

    if (podeOperar(funcao)) {
      el('areaLoja').hidden = false;

      if (funcao === 'ADM') {
        el('areaXicara').hidden = false;
      }

      ouvirLoja();
    }

    if (funcao === 'ADM') {
      el('areaAprovacoes').hidden = false;
      el('areaProdutos').hidden = false;
      el('areaHistorico').hidden = false;

      ouvirPendentes();
      ouvirProdutosAdmin();
      ouvirHistorico();
    }
  } catch (erro) {
    limpar();
    aviso(mensagemErro(erro));
  }
});
