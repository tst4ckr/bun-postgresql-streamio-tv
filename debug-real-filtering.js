/**
 * Script para verificar cuántos canales realmente cumplen los criterios originales:
 * - URL contiene '/play/'
 * - Hostname es una IP pública
 */

import { M3UParserService } from './src/infrastructure/parsers/M3UParserService.js';
import fetch from 'node-fetch';
import { URL } from 'url';

/**
 * Verifica si una dirección IP es pública
 */
function isPublicIP(hostname) {
  // Verificar que sea una IP válida
  const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (!ipRegex.test(hostname)) {
    return false;
  }

  const parts = hostname.split('.').map(Number);
  const [a, b, c, d] = parts;

  // Verificar que NO sea IP privada
  // 10.0.0.0/8
  if (a === 10) return false;
  
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return false;
  
  // 192.168.0.0/16
  if (a === 192 && b === 168) return false;
  
  // 127.0.0.0/8 (localhost)
  if (a === 127) return false;
  
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return false;
  
  // 224.0.0.0/4 (multicast)
  if (a >= 224 && a <= 239) return false;
  
  // 240.0.0.0/4 (reserved)
  if (a >= 240) return false;

  return true;
}

/**
 * Filtra canales que realmente cumplen los criterios originales
 */
function filterChannelsWithPlayAndPublicIP(channels) {
  const validChannels = [];
  const examples = [];
  
  for (const channel of channels) {
    try {
      const url = new URL(channel.streamUrl);
      
      // Verificar que contenga '/play/' en la ruta
      const hasPlay = url.pathname.includes('/play/');
      
      // Verificar que el hostname sea una IP pública
      const hasPublicIP = isPublicIP(url.hostname);
      
      if (hasPlay && hasPublicIP) {
        validChannels.push(channel);
        
        // Guardar algunos ejemplos
        if (examples.length < 10) {
          examples.push({
            name: channel.name,
            url: channel.streamUrl,
            hostname: url.hostname,
            pathname: url.pathname
          });
        }
      }
      
    } catch (error) {
      // URL inválida, ignorar
    }
  }
  
  return { validChannels, examples };
}

async function main() {
  try {
    console.log('🔍 Descargando M3U desde iptv-org...');
    
    const response = await fetch('https://iptv-org.github.io/iptv/index.m3u', {
      timeout: 30000,
      headers: {
        'User-Agent': 'TV-IPTV-Addon/1.0.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
    }
    
    const m3uContent = await response.text();
    console.log(`📥 M3U descargado: ${m3uContent.length} caracteres`);
    
    // Parsear M3U
    const parser = new M3UParserService({});
    const channels = await parser.parseM3U(m3uContent);
    console.log(`📺 Canales parseados: ${channels.length}`);
    
    // Aplicar filtro real (con /play/ e IP pública)
    const { validChannels, examples } = filterChannelsWithPlayAndPublicIP(channels);
    
    console.log('\n📊 RESULTADOS DEL FILTRADO REAL:');
    console.log(`Total de canales parseados: ${channels.length}`);
    console.log(`Canales con /play/ e IP pública: ${validChannels.length}`);
    console.log(`Porcentaje que cumple criterios: ${((validChannels.length / channels.length) * 100).toFixed(2)}%`);
    
    if (examples.length > 0) {
      console.log('\n🔍 EJEMPLOS DE CANALES QUE CUMPLEN CRITERIOS:');
      examples.forEach((example, index) => {
        console.log(`${index + 1}. ${example.name}`);
        console.log(`   URL: ${example.url}`);
        console.log(`   Hostname: ${example.hostname}`);
        console.log(`   Path: ${example.pathname}`);
        console.log('');
      });
    } else {
      console.log('\n❌ NO SE ENCONTRARON CANALES QUE CUMPLAN LOS CRITERIOS');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();