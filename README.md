# MeetFlow Empresarial

Plataforma empresarial para organizar reuniões, compartilhar links de agendamento, conversar em equipe e publicar status com foto ou vídeo por 24 horas.

## O que já existe

- landing page, entrada segura e cadastro inicial do workspace;
- painel responsivo para desktop e celular;
- perfis profissionais com foto, nome e cargo;
- configurações de perfil, workspace, sessão e exclusão de conta;
- colaboradores ativos, convites pendentes e níveis de acesso;
- agenda semanal e criação rápida de reuniões;
- prevenção de conflitos de horário no backend;
- tipos de reunião com link público de agendamento;
- disponibilidade semanal por usuário;
- cadastro, login e autorização com JWT;
- empresas isoladas, administradores e membros de equipe;
- canais de chat, histórico e atualização em tempo real via WebSocket;
- status de texto, foto ou vídeo com expiração automática em 24 horas;
- envio de confirmação por AWS SES, com modo de log para desenvolvimento;
- migrations PostgreSQL com Flyway;
- documentação Swagger/OpenAPI;
- execução completa com Docker Compose.

## Tecnologias

| Camada | Tecnologias |
| --- | --- |
| Interface | React 19, TypeScript, Vinext e CSS responsivo |
| Hospedagem | Sites, autenticação integrada, D1 e R2 |
| API | Java 17, Spring Boot, Spring Security e Bean Validation |
| Dados | Spring Data JPA, PostgreSQL e Flyway |
| Tempo real | Spring WebSocket com STOMP |
| E-mail | AWS SDK e Amazon SES |
| Infraestrutura | Docker e Docker Compose |

## Estrutura

```text
meetflow-empresarial/
├── app/                    # interface web
├── db/                     # esquema do banco da versão hospedada
├── drizzle/                # migrations D1 versionadas
├── backend/
│   ├── src/main/java/      # API Spring Boot
│   ├── src/main/resources/ # configurações e migrations
│   ├── Dockerfile
│   └── pom.xml
├── compose.yaml            # web + API + PostgreSQL
├── Dockerfile.web
└── .env.example
```

O backend está organizado por domínio: `auth`, `meeting`, `chat`, `status`, `team`, `security`, `repository` e `domain`. A versão hospedada usa rotas server-side próprias, sempre protegidas pela identidade da plataforma e pelo vínculo do usuário ao workspace.

## Versão hospedada

A aplicação publicada não usa mais listas locais nem dados de demonstração. Cada pessoa entra com uma identidade verificada e conclui o cadastro do perfil ou aceita um convite existente.

- D1 guarda empresas, perfis, membros, reuniões, canais, mensagens e metadados dos status;
- R2 guarda fotos de perfil, imagens e vídeos;
- todas as consultas são limitadas ao `organizationId` da sessão;
- a agenda rejeita reuniões conflitantes;
- o chat é atualizado automaticamente entre as pessoas conectadas;
- status vencidos deixam de aparecer após 24 horas;
- a conta só é excluída após confirmação explícita.

As principais rotas da aplicação hospedada ficam em `app/api`. O backend Java/PostgreSQL continua no repositório como implantação independente para infraestrutura própria.

## Rodar o projeto inteiro

Pré-requisito: Docker Desktop ou Docker Engine com o plugin Compose.

1. Crie o arquivo de configuração local:

   ```bash
   cp .env.example .env
   ```

2. Inicie todos os serviços:

   ```bash
   docker compose up --build
   ```

3. Abra:

   - Interface: `http://localhost:3000`
   - API: `http://localhost:8080`
   - Swagger: `http://localhost:8080/swagger-ui.html`
   - Saúde da API: `http://localhost:8080/actuator/health`

O PostgreSQL fica disponível em `localhost:5432`. Os dados e as mídias usam volumes Docker e permanecem após reiniciar os contêineres.

Para encerrar:

```bash
docker compose down
```

Para também apagar o banco e as mídias locais:

```bash
docker compose down --volumes
```

## Primeiro usuário

Registre a empresa e o administrador:

```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Marcos Matheus",
    "email": "marcos@empresa.com",
    "password": "senha-segura-123",
    "organizationName": "Flow Studio"
  }'
```

A resposta contém um `token`. Nas rotas protegidas, envie:

```text
Authorization: Bearer SEU_TOKEN
```

Ao cadastrar a empresa, o sistema cria automaticamente o canal de chat `Geral`.

## Rotas principais

| Método e rota | Finalidade |
| --- | --- |
| `POST /api/auth/register` | Criar empresa e administrador |
| `POST /api/auth/login` | Entrar e receber JWT |
| `GET /api/auth/me` | Consultar usuário atual |
| `GET/POST /api/meetings` | Listar e criar reuniões |
| `PATCH /api/meetings/{id}/cancel` | Cancelar reunião |
| `GET/POST /api/meeting-types` | Gerenciar tipos e links públicos |
| `GET/POST /api/availability` | Configurar disponibilidade |
| `GET /api/public/meeting-types/{slug}` | Abrir tipo público |
| `GET /api/public/meeting-types/{slug}/slots?date=AAAA-MM-DD` | Consultar horários livres |
| `POST /api/public/meeting-types/{slug}/book` | Reservar horário público |
| `GET/POST /api/chat/channels` | Listar e criar canais |
| `GET/POST /api/chat/channels/{id}/messages` | Histórico e envio de mensagens |
| `GET/POST /api/statuses` | Listar e publicar status |
| `DELETE /api/statuses/{id}` | Excluir o próprio status |
| `GET /api/team` | Listar equipe da empresa |

Clientes do chat recebem novas mensagens no tópico STOMP `/topic/channels/{channelId}`. O handshake é feito em `/ws` e o cliente deve enviar `Authorization: Bearer SEU_TOKEN` no frame STOMP `CONNECT`.

## Fotos e vídeos de status

No desenvolvimento, os arquivos ficam no volume `meetflow_media`. Formatos aceitos:

- JPG, PNG e WebP;
- MP4, MOV e WebM;
- até 100 MB por publicação.

Um processo agendado remove do banco e do armazenamento os status vencidos. Para produção em múltiplas instâncias, o próximo passo recomendado é trocar o armazenamento local por Amazon S3 ou outro armazenamento de objetos.

## Configurar AWS SES

O padrão é `MAIL_MODE=log`: a confirmação aparece apenas nos logs do backend e nenhuma mensagem é enviada.

Para usar o SES:

1. verifique o domínio ou remetente na AWS;
2. configure credenciais AWS no ambiente de execução;
3. altere `MAIL_MODE=ses`;
4. defina `AWS_REGION` e `AWS_SES_FROM`.

As credenciais AWS não devem ser colocadas no repositório ou no arquivo `.env` compartilhado.

## Decisões de arquitetura

- O ambiente hospedado usa identidade integrada, D1 e R2 para funcionar sem dados locais.
- A implantação Docker mantém Spring Boot, JWT e PostgreSQL para empresas que preferem infraestrutura própria.
- O chat hospedado usa sincronização periódica; o backend Spring fornece WebSocket/STOMP para tempo real em uma implantação dedicada.
- O armazenamento local do backend Java é adequado ao desenvolvimento. Em múltiplas instâncias, use S3 ou outro armazenamento de objetos.
- Google Meet, Microsoft Teams, Zoom e calendários externos permanecem como integrações opcionais.

## Próximas evoluções

1. envio de convite e lembretes por e-mail;
2. integração com Google Calendar, Outlook, Meet, Teams e Zoom;
3. notificações dentro do produto e lembretes agendados;
4. confirmação de presença e reagendamento pelo convidado;
5. status com visualizações, respostas e reações;
6. processamento e miniaturas de vídeo;
7. testes de integração com Testcontainers e pipeline de CI.

## Desenvolvimento sem Docker

Backend:

```bash
cd backend
mvn spring-boot:run
```

Interface:

```bash
npm install
npm run dev
```

Nesse modo, mantenha PostgreSQL disponível e configure as variáveis descritas em `.env.example`.
