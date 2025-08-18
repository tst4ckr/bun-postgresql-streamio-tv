# 🚀 Despliegue en Stremio Beamup

Esta guía te ayudará a desplegar tu addon de TV IPTV usando **Stremio Beamup**, la plataforma oficial para addons de Stremio.

## 📋 ¿Qué es Stremio Beamup?

[Stremio Beamup](https://github.com/Stremio/stremio-beamup) es una plataforma como servicio (PaaS) específicamente diseñada para hospedar addons de Stremio. Es tan fácil como Heroku pero sin restricciones y optimizada para streaming.

### ✨ Ventajas

- ✅ **Específico para Stremio**: Optimizado para addons de Stremio
- ✅ **Cache optimizado**: Políticas de cache específicas para streaming
- ✅ **Sin restricciones**: Sin límites de uso
- ✅ **Zero downtime**: Usa Docker Swarm
- ✅ **Fácil de usar**: Similar a Heroku/Now.sh

## 🚀 Opción 1: Usar Beamup Público

### Paso 1: Instalar beamup-cli

```bash
# Instalar beamup-cli globalmente
bun add -g beamup-cli

# O usar bunx
bunx beamup-cli
```

### Paso 2: Preparar el Proyecto

```bash
# Asegúrate de que el proyecto esté en GitHub
git add .
git commit -m "Preparar para despliegue en Beamup"
git push origin main
```

### Paso 3: Desplegar con beamup-cli

```bash
# Inicializar despliegue
beamup init

# Seguir las instrucciones para:
# 1. Autenticarte con GitHub
# 2. Seleccionar tu repositorio
# 3. Configurar variables de entorno
```

### Paso 4: Configurar Variables de Entorno

```bash
# Configurar variables de entorno
bunx beamup-cli config:set NODE_ENV=production
bunx beamup-cli config:set PORT=3000
bunx beamup-cli config:set CHANNELS_SOURCE=csv
bunx beamup-cli config:set CHANNELS_FILE=data/channels.csv
```

### Paso 5: Obtener URL del Addon

```bash
# Ver información del addon
bunx beamup-cli info

# Obtener URL del manifest
# Ejemplo: https://tu-addon.beamup.dev/manifest.json
```

## 🏗️ Opción 2: Desplegar tu Propio Beamup

Si prefieres control total, puedes desplegar tu propia instancia de Beamup.

### Prerrequisitos

- ✅ Cuenta en Cherryservers
- ✅ Terraform 1.9.x
- ✅ Ansible 7.7
- ✅ Dominio personalizado
- ✅ Cuenta en CloudFlare

### Pasos de Despliegue

1. **Clonar Beamup:**
   ```bash
   git clone https://github.com/Stremio/stremio-beamup.git
   cd stremio-beamup
   ```

2. **Configurar credenciales:**
   ```bash
   # Crear directorio de credenciales
   mkdir creds
   
   # Configurar Cherryservers
   echo "TU_PROJECT_ID" > creds/cherryservers_project_id
   echo "TU_API_KEY" > creds/cherryservers
   
   # Configurar CloudFlare
   echo "TU_ZONE_ID" > creds/cloudflare_zone_id
   echo "TU_API_TOKEN" > creds/cloudflare_token
   ```

3. **Generar SSH keys:**
   ```bash
   ssh-keygen -t ed25519 -f id_deploy
   ssh-add id_deploy
   ```

4. **Configurar variables:**
   ```bash
   # Copiar y editar archivos de configuración
   cp dev.tfvars.example dev.tfvars
   # Editar dev.tfvars con tus configuraciones
   ```

5. **Desplegar infraestructura:**
   ```bash
   terraform init
   terraform apply -var-file=dev.tfvars
   ```

6. **Desplegar addon:**
   ```bash
   # Usar beamup-cli para desplegar tu addon
   bunx beamup-cli deploy
   ```

## 🔧 Configuración Específica para tu Addon

### 1. Crear Procfile para Beamup

```bash
# Crear archivo Procfile
echo "web: bun run start:prod" > Procfile
```

### 2. Configurar package.json

```json
{
  "scripts": {
    "start": "bun run src/index.js",
    "build": "bun install"
  },
  "engines": {
    "bun": ">=1.0.0"
  }
}
```

### 3. Variables de Entorno Recomendadas

```bash
# Configuración del servidor
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Fuentes de datos
CHANNELS_SOURCE=csv
CHANNELS_FILE=data/channels.csv
UPDATE_INTERVAL_HOURS=4

# Filtros
ALLOWED_COUNTRIES=MX,ES,AR,CO,US
DEFAULT_LANGUAGE=es
ENABLE_ADULT_CHANNELS=false

# Cache
STREAM_CACHE_MAX_AGE=300
CATALOG_CACHE_MAX_AGE=3600
```

## 📊 Monitoreo y Logs

### Ver Logs del Addon

```bash
# Ver logs en tiempo real
bunx beamup-cli logs -f

# Ver logs de errores
bunx beamup-cli logs --err

# Ver logs de los últimos N minutos
bunx beamup-cli logs --since 10m
```

### Métricas de Rendimiento

```bash
# Ver información del addon
bunx beamup-cli info

# Ver uso de recursos
bunx beamup-cli stats
```

## 🚀 Publicar en Stremio Central

Una vez desplegado en Beamup:

```bash
# Usar el script de publicación
bun run publish-addon https://tu-addon.beamup.dev/manifest.json
```

## 🔒 Seguridad y Optimización

### 1. Variables Sensibles

```bash
# Nunca committear config.env
echo "config.env" >> .gitignore

# Usar variables de entorno de Beamup
beamup config:set API_KEY=tu_api_key_secreta
```

### 2. Rate Limiting

Beamup incluye rate limiting automático optimizado para addons de Stremio.

### 3. Cache Optimizado

Beamup aplica automáticamente:
- Cache de catálogos: 1 hora
- Cache de streams: 5 minutos
- Cache de manifest: 1 hora

## 🛠️ Solución de Problemas

### Problemas Comunes

#### ❌ **Error: Build failed**
```bash
# Verificar que Procfile esté correcto
cat Procfile

# Verificar que package.json tenga los scripts correctos
cat package.json | grep -A 5 '"scripts"'
```

#### ❌ **Error: Addon no responde**
```bash
# Verificar logs
bunx beamup-cli logs

# Verificar variables de entorno
bunx beamup-cli config
```

#### ❌ **Error: Streams no cargan**
```bash
# Verificar configuración de canales
bunx beamup-cli config:get CHANNELS_FILE

# Verificar logs de errores
bunx beamup-cli logs --err
```

## 📈 Ventajas de Beamup vs Otras Plataformas

| Característica | Beamup | Vercel | Railway | Heroku |
|----------------|--------|--------|---------|--------|
| **Optimizado para Stremio** | ✅ | ❌ | ❌ | ❌ |
| **Cache específico** | ✅ | ❌ | ❌ | ❌ |
| **Sin restricciones** | ✅ | ❌ | ❌ | ❌ |
| **Zero downtime** | ✅ | ✅ | ✅ | ✅ |
| **Fácil de usar** | ✅ | ✅ | ✅ | ✅ |
| **Gratis** | ✅ | ✅ | ❌ | ❌ |

## 🎉 ¡Listo para Usar Beamup!

### Próximos Pasos

1. ✅ **Elegir opción**: Beamup público o propio
2. ✅ **Preparar proyecto**: Procfile y configuración
3. ✅ **Desplegar**: Usar beamup-cli
4. ✅ **Configurar**: Variables de entorno
5. ✅ **Probar**: Verificar en Stremio
6. ✅ **Publicar**: En Stremio Central

### Recursos Útiles

- 📚 [Documentación de Beamup](https://github.com/Stremio/stremio-beamup)
- 🛠️ [beamup-cli](https://github.com/Stremio/beamup-cli)
- 💬 [Comunidad de Stremio](https://discord.gg/stremio)
- 🐛 [Issues de Beamup](https://github.com/Stremio/stremio-beamup/issues)

---

**¡Beamup es la plataforma ideal para tu addon de TV IPTV!** 🚀📺
