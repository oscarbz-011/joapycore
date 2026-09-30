# Recuperación del trabajo pendiente y Gitflow profesional

Fecha: 2026-09-18

## Objetivo

Recuperar el trabajo funcional acumulado fuera de commits, integrarlo de forma
revisable en `develop` y establecer un flujo obligatorio de ramas, pull
requests, revisión y CI para el desarrollo futuro. `develop` y `main` son las
dos ramas permanentes; `main` representa producción y no recibe trabajo de
desarrollo ordinario.

## Estado de partida

- El checkout estaba en `develop`, un commit por delante y uno por detrás de
  `origin/develop`.
- El commit local `46560ba` agrega SMTP por tenant y todavía no existe en el
  remoto.
- El working tree contiene cambios de aplicaciones de correo, usuarios,
  ventas, finanzas, facturación, documentos, comunicaciones, frontend, CI y
  documentación.
- `.claude` contiene 169 archivos y mezcla reglas específicas de JoapyCore con
  material genérico de Spartan para Kotlin, Micronaut, Gradle, Exposed y
  Flyway. Esas reglas contradicen el stack real NestJS, Prisma y pnpm.
- Los comandos de PR existentes usan `main` como base normal, aunque el
  proyecto mantiene `develop` como rama de integración.
- GitHub informa que la protección de ramas no está disponible para este
  repositorio privado con el plan actual. CI puede detectar incumplimientos,
  pero no impedir un push directo una vez realizado.

## Estrategia de recuperación

El trabajo se recuperará en `feature/shared/communications-recovery`. La rama
conservará el commit local existente y recibirá commits atómicos para las
unidades funcionales pendientes. Una vez limpio el working tree, la rama se
actualizará contra `origin/develop`, se verificará completamente y se publicará
mediante un PR hacia `develop`.

Se usará staging por rutas y por hunks. Los archivos compartidos, como
`BACK/prisma/schema.prisma`, `BACK/package.json`, `BACK/pnpm-lock.yaml`, los
módulos raíz y las pantallas que contienen más de una funcionalidad, se
separarán sin descartar ningún cambio. Cada commit debe compilar con el estado
acumulado que le precede y debe incluir las pruebas que validan su comportamiento.

La partición objetivo es:

1. Recepción IMAP y buzón de correo de Aplicaciones.
2. Cambio seguro del correo del usuario autenticado.
3. Validación de stock durante el flujo de venta a crédito.
4. Actualización de mora y componentes mensuales de financiación.
5. Emisión recuperable de facturas y regeneración de PDF.
6. Primera vertical del Centro de Comunicaciones para facturas.
7. Infraestructura y cobertura de integración de Comunicaciones.
8. Documentación operativa y de arquitectura.

Si el diff demuestra que dos unidades dependen inseparablemente entre sí, se
combinarán en un solo commit coherente en vez de fabricar una separación que
deje estados intermedios rotos. Los cambios puramente de formato se separarán
cuando sea posible y nunca ocultarán cambios funcionales.

## Verificación de la recuperación

Antes del PR se ejecutarán, con pnpm, las comprobaciones definidas por cada
workspace:

- Backend: generación de Prisma, TypeScript/build, lint y Prettier, pruebas
  unitarias, integración y e2e.
- Frontend: TypeScript/build, lint y Vitest.
- Comunicaciones: integración aislada con PostgreSQL y Redis.
- Git: `git diff --check`, revisión de secretos y working tree limpio.

Las pruebas que necesiten servicios externos usarán bases desechables y nunca
la base habitual. No se afirmará que SMTP real o revisión visual están
verificados si no se ejecutan expresamente.

## Política de ramas

| Tipo | Rama de origen | Destino del PR |
| --- | --- | --- |
| `feature/*` | `develop` | `develop` |
| `fix/*` | `develop` | `develop` |
| `refactor/*` | `develop` | `develop` |
| `chore/*`, `docs/*`, `test/*`, `ci/*` | `develop` | `develop` |
| `release/<semver>` | `develop` | `main`; luego sincronizar `main` en `develop` |
| `hotfix/*` | tag desplegado de `main` | `main`; luego integrar el mismo cambio en `develop` |

Formato preferido: `<tipo>/<scope>/<ticket>-<slug>`. El ticket es obligatorio
cuando existe en el gestor de incidencias y se omite cuando el trabajo todavía
no tiene uno. Ejemplos: `feature/back/123-communications-worker`,
`fix/front/invoice-retry` y `refactor/shared/git-policy`.

Las ramas de trabajo se publican, reciben commits atómicos y se eliminan tras
el merge. Una rama privada de una sola persona puede rebasarse sobre la rama
base antes de abrir el PR. Una rama compartida incorpora la base mediante
merge para no reescribir el trabajo de otros. Después de iniciar la revisión no
se fuerza el push.

## Política de commits y merges

- Conventional Commits sin emojis obligatorios ni trailers de coautoría.
- Un commit representa un propósito comprobable y reversible.
- Los tests del comportamiento viajan con su implementación.
- Se agregan rutas explícitas; no se usa `git add .` ni `git add -A` cuando el
  working tree contiene más de una unidad de trabajo.
- Los PRs hacia `develop` conservan los commits lógicos mediante merge commit.
- Releases y hotfixes reciben tag anotado con Semantic Versioning al entrar en
  `main`.
- No hay pushes directos intencionales a `develop` o `main`.

## Pull requests y code review

Todo PR debe incluir resumen, motivación, cambios, plan de pruebas, migraciones,
riesgos, rollback y evidencia de verificación. La revisión compara siempre el
diff contra la base real del PR.

El flujo es:

1. Sincronizar la rama con su base.
2. Ejecutar todas las comprobaciones aplicables.
3. Crear el PR con base determinada por el tipo de rama.
4. Realizar autoevaluación y code review independiente.
5. Corregir hallazgos en commits explícitos y volver a verificar.
6. Fusionar solo cuando no existan bloqueos conocidos.
7. Eliminar la rama temporal y comprobar el estado de la rama destino.

La primera recuperación seguirá exactamente este circuito hacia `develop`.
`main` permanecerá intacta.

## Automatización y CI

El repositorio tendrá una verificación de política de PR que valide:

- combinaciones permitidas entre rama origen y rama destino;
- nombres de ramas temporales;
- título del PR en formato Conventional Commit;
- que features, fixes y refactors no apunten directamente a `main`;
- que `main` solo reciba releases, hotfixes o la sincronización autorizada desde
  `develop`, según la estrategia final del release.

La CI funcional existente seguirá ejecutándose en PRs hacia `develop` y
`main`, y en pushes posteriores al merge. Dado que el plan de GitHub no ofrece
protección para este repositorio privado, la documentación advertirá que estas
comprobaciones no sustituyen una ruleset remota. La recomendación operativa es
habilitar GitHub Pro antes de incorporar más colaboradores.

## Alineación de `.claude`

Se creará una fuente de verdad concisa para el proyecto y su flujo Git. El
archivo `.claude/CLAUDE.md` apuntará a esa fuente y conservará solamente las
reglas que deben estar siempre en contexto.

Las reglas automáticas se alinearán con NestJS, Prisma, Next.js, PostgreSQL,
Redis, BullMQ y pnpm. El material de Micronaut, Kotlin, Gradle, Exposed y Flyway
se conservará como referencia histórica fuera de las reglas automáticas, para
que no gobierne revisiones ni implementaciones de JoapyCore.

Los comandos de Spartan relacionados con build, debug, review, gate review,
commit, PR y Codex resolverán la base desde la rama y el PR en lugar de asumir
`main`. No se alterarán comandos de producto, investigación o infraestructura
que no participen en Gitflow.

## Entregas

### PR 1 — recuperación funcional

- Rama `feature/shared/communications-recovery`.
- Trabajo pendiente convertido en commits lógicos.
- Verificación completa y code review.
- Merge a `develop`, eliminación de la rama y `main` intacta.

### PR 2 — profesionalización del workflow

- Rama `chore/shared/professional-gitflow`, nacida del `develop` actualizado.
- Guía de contribución y Gitflow como fuente de verdad.
- Plantilla de PR y verificación de política.
- CI y comandos `.claude` alineados con las ramas y el stack reales.
- Verificación, code review y merge a `develop`.

## Fuera de alcance

- Promover `develop` a `main` en esta tarea.
- Hacer público el repositorio o contratar GitHub Pro.
- Reescribir commits que ya existan en ramas remotas compartidas.
- Declarar verificados SMTP real, despliegue productivo o QA visual sin
  evidencia de ejecución.
