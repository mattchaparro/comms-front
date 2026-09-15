#!/usr/bin/env bash
#
# Deploy de nexolu-comms-front (Nexolú Connect) al droplet `nexolu-core`.
#
#   bash deploy.sh              build EN EL SERVIDOR + swap atomico
#   bash deploy.sh local        build local + subida + swap atomico
#   bash deploy.sh rollback     vuelve a la release anterior, sin rebuild
#   bash deploy.sh estado       que hay desplegado ahora mismo
#
# CORRE DESDE TU MAQUINA, NO DESDE EL DROPLET (deploy-menu.sh si lo invoca
# desde alla, y por eso el modo por defecto compila en el servidor).
#
# Puerto directo de nexolu-spa-front/deploy.sh - el patron de releases
# atomicas del ecosistema - con dos diferencias honestas:
#
#   - El droplet destino es nexolu-core (134.122.19.243), donde ya viven
#     comms.nexolu.co y el resto de APIs en Docker. No hay un monolito PHP
#     en vivo como en el legacy, pero el build igual corre con topes de
#     memoria/CPU y bajo nice/ionice: mientras compila, quien tiene que
#     seguir respondiendo es comms-api.
#   - REQUERIDAS incluye VITE_PRIMEVUE_LICENSE_KEY: sin ella la app compila
#     y sale con un watermark "Invalid PrimeUI License" en toda la UI.
#
# Las dos propiedades que el patron garantiza (ver spa-front para la
# historia completa):
#
#   1. EL CLIENTE NUNCA VE UN BUILD A MEDIAS: cada deploy va a
#      releases/<timestamp>/ y el symlink `current` cambia con un rename
#      atomico (`mv -T`, no `ln -sfn` que deja ventana de 404).
#   2. SE PUEDE VOLVER ATRAS: se conservan RETENER releases y `rollback`
#      reapunta `current` en un instante.
set -euo pipefail
cd "$(dirname "$0")"

SERVIDOR="${COMMS_FRONT_SERVER:-root@134.122.19.243}"
APP_DIR="${COMMS_FRONT_APP_DIR:-/opt/nexolu/nexolu-comms-front}"
URL="${COMMS_FRONT_URL:-https://connect.nexolu.co}"
RETENER="${RETENER:-3}"

# El checkout del que sale el build remoto (clonado con su deploy key; ver
# nexolu-utils/docs/infra/connect-front.md).
SRC_DIR="${COMMS_FRONT_SRC_DIR:-/opt/nexolu/nexolu-comms-front-src}"

NODE_IMAGE="${NODE_IMAGE:-node:22-alpine}"

# Topes del contenedor de build (RAM real / RAM+swap segun Docker). Si el
# build se pasa, muere SOLO el contenedor: el deploy falla limpio y el panel
# sigue sirviendo la version anterior.
MEM_LIMIT="${MEM_LIMIT:-700m}"
MEM_SWAP_LIMIT="${MEM_SWAP_LIMIT:-1400m}"
NODE_HEAP_MB="${NODE_HEAP_MB:-512}"
BUILD_CPUS="${BUILD_CPUS:-0.5}"

log() { echo "[comms-front] $*"; }
fallar() { echo "[comms-front] ERROR: $*" >&2; exit 1; }

remoto() { ssh "$SERVIDOR" "$@"; }

# `mv -T` = rename(2): el cliente ve una version o la otra, nunca un 404.
APUNTAR='apuntar() { ln -sfn "$2" "$1.nuevo"; mv -T "$1.nuevo" "$1"; }'

estado() {
    remoto "cd '$APP_DIR' 2>/dev/null || exit 0
        echo 'current  -> ' \$(readlink -f current 2>/dev/null || echo '(sin definir)')
        echo 'previous -> ' \$(readlink -f previous 2>/dev/null || echo '(sin definir)')
        echo 'releases:'; ls -1t releases 2>/dev/null | sed 's/^/  /'"
}

verificar() {
    local codigo
    codigo="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$URL/" 2>/dev/null || echo 000)"
    log "curl $URL/ -> $codigo"
    [ "$codigo" = "200" ] || log "AVISO: no devolvio 200. Revisar nginx y, si hace falta: bash deploy.sh rollback"
}

rollback() {
    remoto "set -e; cd '$APP_DIR'; $APUNTAR
        [ -L previous ] || { echo 'no hay release anterior registrada' >&2; exit 1; }
        destino=\$(readlink -f previous)
        [ -f \"\$destino/index.html\" ] || { echo 'la release anterior no tiene index.html' >&2; exit 1; }
        actual=\$(readlink -f current 2>/dev/null || true)
        apuntar current \"\$destino\"
        [ -n \"\$actual\" ] && apuntar previous \"\$actual\"
        echo \"current -> \$(basename \$destino)\""
    verificar
}

# rsync si esta, tar sobre ssh si no (Git Bash en Windows no trae rsync).
subir() {
    local origen="$1" destino="$2"

    if command -v rsync >/dev/null 2>&1; then
        rsync -az --checksum "$origen/" "$SERVIDOR:$destino/"
    else
        tar -czf - -C "$origen" . | remoto "tar -xzf - -C '$destino'"
    fi
}

# Variables que el build de PRODUCCION hornea en el bundle. Su ausencia NO
# da error de compilacion: la app sale incompleta en silencio (bug real del
# 2026-09-07 en spa-front: sin VITE_AUTH_BASE_URL desaparece el boton
# "Entrar con Nexolu" y nadie puede entrar). Por eso el deploy se detiene
# ANTES de compilar.
REQUERIDAS=(
    VITE_API_BASE_URL
    VITE_AUTH_BASE_URL
    VITE_PRIMEVUE_LICENSE_KEY
)

verificar_env() {
    [ -f .env ] || fallar "no hay .env. Copia .env.example y llenalo."

    local faltan=()

    for var in "${REQUERIDAS[@]}"; do
        if ! grep -qE "^${var}=.+" .env; then
            faltan+=("$var")
        fi
    done

    if [ ${#faltan[@]} -gt 0 ]; then
        echo "[comms-front] ERROR: al .env le faltan variables que el build hornea:" >&2

        for var in "${faltan[@]}"; do
            echo "               $var" >&2
        done

        echo "" >&2
        echo "           Sin ellas la app compila igual y sale a produccion incompleta," >&2
        echo "           sin ningun error visible. Ver .env.example para los valores." >&2

        exit 1
    fi
}

publicar_desde() {
    local origen="$1" release="$2"

    log "4/6 Copiando a la release $release"
    remoto "mkdir -p '$APP_DIR/releases/$release' && cp -a '$origen/.' '$APP_DIR/releases/$release/'"

    log "5/6 Verificando antes de cambiar nada"
    remoto "test -f '$APP_DIR/releases/$release/index.html'" \
        || fallar "la release no tiene index.html; no se cambia current."

    remoto "set -e; cd '$APP_DIR'; $APUNTAR
        actual=\$(readlink -f current 2>/dev/null || true)
        apuntar current '$APP_DIR/releases/$release'
        [ -n \"\$actual\" ] && apuntar previous \"\$actual\" || apuntar previous '$APP_DIR/releases/$release'
        chown -R www-data:www-data '$APP_DIR/releases/$release'"

    log "6/6 Limpiando releases viejas (se conservan $RETENER)"
    remoto "cd '$APP_DIR/releases'
        protegidas=\"\$(readlink -f ../current 2>/dev/null | xargs -r basename) \$(readlink -f ../previous 2>/dev/null | xargs -r basename)\"
        ls -1t | tail -n +$((RETENER + 1)) | while read -r vieja; do
            case \" \$protegidas \" in *\" \$vieja \"*) continue ;; esac
            rm -rf -- \"\$vieja\"
        done"

    log "Listo: release $release"
    verificar
}

desplegar_remoto() {

    log "1/6 Actualizando el repo en el servidor"
    remoto "cd '$SRC_DIR' && git fetch -q origin && git reset -q --hard origin/main"

    log "2/6 Verificando el .env del servidor"

    local faltan
    faltan="$(remoto "cd '$SRC_DIR' && for v in ${REQUERIDAS[*]}; do grep -qE \"^\${v}=.+\" .env || echo \"\$v\"; done")"

    if [ -n "$faltan" ]; then
        echo "[comms-front] ERROR: al .env de $SRC_DIR le faltan variables:" >&2
        echo "$faltan" | sed 's/^/               /' >&2
        echo "" >&2
        echo "           Sin ellas la app compila igual y sale incompleta." >&2
        exit 1
    fi

    log "3/6 Build en el servidor ($NODE_IMAGE, mem=$MEM_LIMIT, cpus=$BUILD_CPUS)"

    if ! remoto "cd '$SRC_DIR' && ionice -c3 nice -n 19 docker run --rm \
        --name comms-front-build \
        --user root \
        --memory '$MEM_LIMIT' \
        --memory-swap '$MEM_SWAP_LIMIT' \
        --cpus '$BUILD_CPUS' \
        -e NODE_OPTIONS='--max-old-space-size=$NODE_HEAP_MB' \
        -e CI=true \
        -v '$SRC_DIR':/app \
        -w /app \
        '$NODE_IMAGE' \
        sh -c 'rm -rf dist && npm ci --no-audit --no-fund && npm run build'"
    then
        fallar "el build fallo (o lo mato el tope de memoria). NO se toco 'current': el panel sigue sirviendo la version anterior."
    fi

    remoto "test -f '$SRC_DIR/dist/index.html'" \
        || fallar "el build termino sin error pero no dejo dist/index.html."

    publicar_desde "$SRC_DIR/dist" "$(date +%Y%m%d-%H%M%S)"
}

desplegar() {

    log "0/5 Verificando el .env"
    verificar_env

    log "1/5 Build local (vue-tsc + vite)"
    npm run build

    [ -f dist/index.html ] || fallar "el build no genero dist/index.html."

    local release
    release="$(date +%Y%m%d-%H%M%S)"

    log "2/5 Subiendo release $release"
    remoto "mkdir -p '$APP_DIR/releases/$release'"
    subir dist "$APP_DIR/releases/$release"

    log "3/5 Verificando lo subido antes de cambiar nada"
    remoto "test -f '$APP_DIR/releases/$release/index.html'" \
        || fallar "la release subida no tiene index.html; no se cambia current."

    log "4/5 Cambiando current (rename atomico)"
    remoto "set -e; cd '$APP_DIR'; $APUNTAR
        actual=\$(readlink -f current 2>/dev/null || true)
        apuntar current '$APP_DIR/releases/$release'
        [ -n \"\$actual\" ] && apuntar previous \"\$actual\" || apuntar previous '$APP_DIR/releases/$release'
        chown -R www-data:www-data '$APP_DIR/releases/$release'"

    log "5/5 Limpiando releases viejas (se conservan $RETENER)"
    remoto "cd '$APP_DIR/releases'
        protegidas=\"\$(readlink -f ../current 2>/dev/null | xargs -r basename) \$(readlink -f ../previous 2>/dev/null | xargs -r basename)\"
        ls -1t | tail -n +$((RETENER + 1)) | while read -r vieja; do
            case \" \$protegidas \" in *\" \$vieja \"*) continue ;; esac
            rm -rf -- \"\$vieja\"
        done"

    log "Listo: release $release"
    verificar
}

case "${1:-deploy}" in
    deploy|remoto) desplegar_remoto ;;
    local) desplegar ;;
    rollback) rollback ;;
    estado|status) estado ;;
    *) fallar "uso: bash deploy.sh [deploy|local|rollback|estado]" ;;
esac
