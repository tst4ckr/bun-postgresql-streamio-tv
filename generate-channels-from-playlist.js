import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Función para generar ID único basado en el nombre del canal
function generateChannelId(channelName) {
    return channelName
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // Remover caracteres especiales
        .replace(/\s+/g, '_') // Reemplazar espacios con guiones bajos
        .replace(/^_+|_+$/g, '') // Remover guiones bajos al inicio y final
        .substring(0, 50); // Limitar longitud
}

// Función para determinar el género basado en el nombre del canal
function determineGenre(channelName) {
    const name = channelName.toLowerCase();
    
    if (name.includes('news') || name.includes('noticias') || name.includes('cnn') || name.includes('bbc news')) {
        return 'News';
    }
    if (name.includes('sport') || name.includes('espn') || name.includes('fox sports') || name.includes('deportes')) {
        return 'Sports';
    }
    if (name.includes('kids') || name.includes('cartoon') || name.includes('disney') || name.includes('nick') || name.includes('baby')) {
        return 'Kids';
    }
    if (name.includes('movie') || name.includes('cinema') || name.includes('film') || name.includes('cine') || name.includes('hbo') || name.includes('fx')) {
        return 'Movies';
    }
    if (name.includes('music') || name.includes('mtv') || name.includes('vh1') || name.includes('mix')) {
        return 'Music';
    }
    if (name.includes('discovery') || name.includes('history') || name.includes('national geographic') || name.includes('animal planet')) {
        return 'Documentary';
    }
    if (name.includes('comedy') || name.includes('adult swim')) {
        return 'Comedy';
    }
    if (name.includes('bethel') || name.includes('enlace') || name.includes('esne')) {
        return 'Religious';
    }
    if (name.includes('anime') || name.includes('toonami')) {
        return 'Animation';
    }
    
    return 'General';
}

// Función para determinar el país basado en el nombre del canal
function determineCountry(channelName) {
    const name = channelName.toLowerCase();
    
    if (name.includes('peru') || name.includes('latina') || name.includes('america tv') || name.includes('atv') || name.includes('panamericana')) {
        return 'Peru';
    }
    if (name.includes('mexico') || name.includes('azteca') || name.includes('televisa') || name.includes('canal 5')) {
        return 'Mexico';
    }
    if (name.includes('colombia') || name.includes('caracol') || name.includes('rcn')) {
        return 'Colombia';
    }
    if (name.includes('argentina') || name.includes('telefe') || name.includes('canal 13')) {
        return 'Argentina';
    }
    if (name.includes('chile') || name.includes('chv') || name.includes('mega')) {
        return 'Chile';
    }
    if (name.includes('usa') || name.includes('cnn') || name.includes('fox') || name.includes('nbc') || name.includes('abc')) {
        return 'USA';
    }
    if (name.includes('spain') || name.includes('antena 3') || name.includes('telecinco')) {
        return 'Spain';
    }
    
    return 'International';
}

// Función para generar URL de logo basada en el nombre del canal
function generateLogoUrl(channelName) {
    const name = channelName.toLowerCase();
    
    // Mapeo de canales conocidos con sus logos
    const logoMap = {
        'latina': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Latina_Televisi%C3%B3n_logo.svg/512px-Latina_Televisi%C3%B3n_logo.svg.png',
        'america tv': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Am%C3%A9rica_Televisi%C3%B3n_%28Logo_2020%29.png/512px-Am%C3%A9rica_Televisi%C3%B3n_%28Logo_2020%29.png',
        'atv': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/ATV_logo_2020.png/512px-ATV_logo_2020.png',
        'panamericana': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Panamericana_Televisi%C3%B3n_logo.svg/512px-Panamericana_Televisi%C3%B3n_logo.svg.png',
        'tv peru': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/TV_Per%C3%BA_logo.svg/512px-TV_Per%C3%BA_logo.svg.png',
        'willax': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Willax_Televisi%C3%B3n_logo.png/512px-Willax_Televisi%C3%B3n_logo.png',
        'cnn': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/CNN.svg/512px-CNN.svg.png',
        'bbc': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/BBC_Logo_2021.svg/512px-BBC_Logo_2021.svg.png',
        'espn': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/ESPN_wordmark.svg/512px-ESPN_wordmark.svg.png',
        'fox': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Fox_Broadcasting_Company_Logo.svg/512px-Fox_Broadcasting_Company_Logo.svg.png',
        'disney': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/2019_Disney_Channel_logo.svg/512px-2019_Disney_Channel_logo.svg.png',
        'cartoon network': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Cartoon_Network_2010_logo.svg/512px-Cartoon_Network_2010_logo.svg.png',
        'discovery': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Discovery_Channel_logo.svg/512px-Discovery_Channel_logo.svg.png',
        'history': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/History_%282021%29.svg/512px-History_%282021%29.svg.png',
        'national geographic': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/Natgeologo.svg/512px-Natgeologo.svg.png',
        'animal planet': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/2018_Animal_Planet_logo.svg/512px-2018_Animal_Planet_logo.svg.png',
        'mtv': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/MTV-2021.svg/512px-MTV-2021.svg.png',
        'nickelodeon': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Nickelodeon_2009_logo.svg/512px-Nickelodeon_2009_logo.svg.png',
        'hbo': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/HBO_logo.svg/512px-HBO_logo.svg.png',
        'fx': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/FX_International_logo.svg/512px-FX_International_logo.svg.png',
        'amc': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/AMC_logo_2019.svg/512px-AMC_logo_2019.svg.png',
        'axn': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/AXN_logo_%282015%29.svg/512px-AXN_logo_%282015%29.svg.png',
        'sony': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Sony_Channel_Logo.png/512px-Sony_Channel_Logo.png',
        'universal': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Universal_TV_logo.svg/512px-Universal_TV_logo.svg.png',
        'warner': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Warner2018.svg/512px-Warner2018.svg.png',
        'space': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/SpaceLogo.svg/512px-SpaceLogo.svg.png',
        'tnt': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/TNT_Logo_2016.svg/512px-TNT_Logo_2016.svg.png',
        'tbs': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dc/TBS_logo_2016.svg/512px-TBS_logo_2016.svg.png',
        'comedy central': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Comedy_Central_2018.svg/512px-Comedy_Central_2018.svg.png',
        'e!': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/E%21_Logo.svg/512px-E%21_Logo.svg.png',
        'lifetime': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Logo_Lifetime_2020.svg/512px-Logo_Lifetime_2020.svg.png',
        'tlc': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/TLC_Logo.svg/512px-TLC_Logo.svg.png',
        'food network': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Food_Network_logo.svg/512px-Food_Network_logo.svg.png',
        'travel channel': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Travel_Channel_Logo_2018.svg/512px-Travel_Channel_Logo_2018.svg.png'
    };
    
    // Buscar coincidencia exacta o parcial
    for (const [key, url] of Object.entries(logoMap)) {
        if (name.includes(key)) {
            return url;
        }
    }
    
    // Logo genérico basado en el tipo de canal
    const genre = determineGenre(channelName);
    const genericLogos = {
        'News': 'https://cdn-icons-png.flaticon.com/512/2965/2965879.png',
        'Sports': 'https://cdn-icons-png.flaticon.com/512/857/857438.png',
        'Kids': 'https://cdn-icons-png.flaticon.com/512/2945/2945637.png',
        'Movies': 'https://cdn-icons-png.flaticon.com/512/777/777242.png',
        'Music': 'https://cdn-icons-png.flaticon.com/512/727/727218.png',
        'Documentary': 'https://cdn-icons-png.flaticon.com/512/2965/2965200.png',
        'Comedy': 'https://cdn-icons-png.flaticon.com/512/742/742751.png',
        'Religious': 'https://cdn-icons-png.flaticon.com/512/3159/3159310.png',
        'Animation': 'https://cdn-icons-png.flaticon.com/512/2945/2945637.png',
        'General': 'https://cdn-icons-png.flaticon.com/512/1040/1040241.png'
    };
    
    return genericLogos[genre] || genericLogos['General'];
}

// Función principal para procesar el archivo M3U
function processPlaylistM3U() {
    try {
        console.log('🚀 Iniciando procesamiento de playlist.m3u...');
        
        const playlistPath = path.join(__dirname, 'data', 'playlist.m3u');
        const outputPath = path.join(__dirname, 'data', 'channels.csv');
        
        // Leer el archivo M3U
        const content = fs.readFileSync(playlistPath, 'utf8');
        const lines = content.split('\n').map(line => line.trim()).filter(line => line);
        
        console.log(`📄 Archivo leído: ${lines.length} líneas`);
        
        const channels = [];
        let currentChannel = null;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.startsWith('#EXTINF:')) {
                // Extraer información del canal
                // Formato: #EXTINF:-1 group-title="-",Canal Name
                const match = line.match(/#EXTINF:(-?\d+)\s+group-title="[^"]*",(.+)/);
                if (match) {
                    currentChannel = {
                        name: match[2].trim(),
                        duration: match[1]
                    };
                }
            } else if (line.startsWith('http') && currentChannel) {
                // URL del stream
                const channelId = generateChannelId(currentChannel.name);
                const genre = determineGenre(currentChannel.name);
                const country = determineCountry(currentChannel.name);
                const logoUrl = generateLogoUrl(currentChannel.name);
                
                channels.push({
                    id: channelId,
                    name: currentChannel.name,
                    stream_url: line,
                    logo: logoUrl,
                    genre: genre,
                    country: country,
                    language: 'es',
                    quality: 'HD',
                    type: 'tv',
                    is_active: 'true'
                });
                
                currentChannel = null;
            }
        }
        
        console.log(`✅ Procesados ${channels.length} canales`);
        
        // Generar CSV
        const csvHeader = 'id,name,stream_url,logo,genre,country,language,quality,type,is_active\n';
        const csvContent = channels.map(channel => 
            `${channel.id},"${channel.name}",${channel.stream_url},${channel.logo},${channel.genre},${channel.country},${channel.language},${channel.quality},${channel.type},${channel.is_active}`
        ).join('\n');
        
        const finalCsv = csvHeader + csvContent;
        
        // Escribir archivo CSV
        fs.writeFileSync(outputPath, finalCsv, 'utf8');
        
        console.log(`💾 Archivo channels.csv generado: ${outputPath}`);
        console.log(`📊 Total de canales: ${channels.length}`);
        
        // Estadísticas por género
        const genreStats = {};
        channels.forEach(channel => {
            genreStats[channel.genre] = (genreStats[channel.genre] || 0) + 1;
        });
        
        console.log('\n📈 Estadísticas por género:');
        Object.entries(genreStats)
            .sort(([,a], [,b]) => b - a)
            .forEach(([genre, count]) => {
                console.log(`   ${genre}: ${count} canales`);
            });
        
        // Estadísticas por país
        const countryStats = {};
        channels.forEach(channel => {
            countryStats[channel.country] = (countryStats[channel.country] || 0) + 1;
        });
        
        console.log('\n🌍 Estadísticas por país:');
        Object.entries(countryStats)
            .sort(([,a], [,b]) => b - a)
            .forEach(([country, count]) => {
                console.log(`   ${country}: ${count} canales`);
            });
        
        // Mostrar algunos ejemplos
        console.log('\n🎯 Ejemplos de canales procesados:');
        channels.slice(0, 5).forEach((channel, index) => {
            console.log(`   ${index + 1}. ${channel.name} (${channel.genre}) - ${channel.country}`);
        });
        
        console.log('\n✨ ¡Procesamiento completado exitosamente!');
        
    } catch (error) {
        console.error('❌ Error durante el procesamiento:', error.message);
        process.exit(1);
    }
}

// Ejecutar el procesamiento
processPlaylistM3U();