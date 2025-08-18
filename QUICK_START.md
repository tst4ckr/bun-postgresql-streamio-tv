# 🚀 Guía Rápida: Publicar tu Addon en Stremio

Esta es la forma más rápida de publicar tu addon de TV IPTV en Stremio usando **Stremio Beamup**.

## ⚡ Pasos Rápidos (5 minutos)

### 1. 📋 Preparar el Proyecto

```bash
# Asegúrate de que todos los cambios estén en GitHub
git add .
git commit -m "Preparar para publicación en Stremio"
git push origin main
```

### 2. 🚀 Instalar beamup-cli

```bash
# Instalar la herramienta de despliegue
bun add -g beamup-cli
```

### 3. 🔧 Desplegar en Beamup

```bash
# Inicializar despliegue
bunx beamup-cli init

# O usar el script del package.json
bun run beamup-deploy

# Seguir las instrucciones:
# 1. Autenticarte con GitHub
# 2. Seleccionar tu repositorio
# 3. Esperar el despliegue
```

### 4. ⚙️ Configurar Variables (Opcional)

```bash
# Si necesitas configurar variables específicas
bunx beamup-cli config:set NODE_ENV=production
bunx beamup-cli config:set CHANNELS_SOURCE=csv
bunx beamup-cli config:set CHANNELS_FILE=data/channels.csv
```

### 5. 📡 Obtener URL del Addon

```bash
# Ver información del addon
bunx beamup-cli info

# Copiar la URL del manifest
# Ejemplo: https://tu-addon.beamup.dev/manifest.json
```

### 6. 🎯 Publicar en Stremio Central

```bash
# Publicar en el catálogo oficial de Stremio
bun run publish-addon https://tu-addon.beamup.dev/manifest.json
```

## ✅ ¡Listo!

Tu addon ahora está:
- ✅ **Desplegado** en Beamup
- ✅ **Publicado** en Stremio Central
- ✅ **Disponible** para todos los usuarios de Stremio

## 🔗 Enlaces Útiles

- 📺 **Probar en Stremio**: `stremio://tu-addon.beamup.dev/manifest.json`
- 🌐 **URL del manifest**: `https://tu-addon.beamup.dev/manifest.json`
- 📊 **Monitorear**: `bunx beamup-cli logs -f`

## 🛠️ Comandos Útiles

```bash
# Ver logs en tiempo real
bunx beamup-cli logs -f

# Ver información del addon
bunx beamup-cli info

# Ver variables de entorno
bunx beamup-cli config

# Reiniciar addon
bunx beamup-cli restart
```

---

**¡Tu addon de TV IPTV está listo para que millones de usuarios lo disfruten!** 📺🚀
