import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const csvFilePath = path.join(__dirname, 'data', 'channels.csv');

// Lista de canales de cable famosos priorizando versiones HD
const famousCableChannels = [
    // Entretenimiento Premium
    'HBO HD', 'HBO Family HD', 'Cinemax HD', 'Sony HD', 'SONY HD', 'Warner HD', 'WARNER HD',
    'Universal HD', 'UNIVERSAL CHANNEL HD', 'Studio Universal HD', 'Paramount HD',
    
    // Deportes
    'ESPN HD', 'ESPN 2 HD', 'ESPN 3 HD', 'Fox Sports HD', 'Fox Sports 2 HD', 'Fox Sports 3 HD',
    'Golf Channel HD',
    
    // Entretenimiento General
    'TNT HD', 'TNT Series HD', 'FX HD', 'AXN HD', 'AMC HD', 'A&E HD',
    
    // Documentales
    'Discovery Channel HD', 'Discovery HD', 'Discovery Theater HD', 'Discovery ID HD',
    'Animal Planet HD', 'History Channel HD', 'History HD', 'ID HD',
    
    // Infantiles
    'Disney HD', 'Discovery Kids HD', 'Cartoon Network',
    
    // Música y Entretenimiento
    'MTV HD', 'MTV LIVE HD',
    
    // Comedia
    'Comedy Central HD',
    
    // Noticias
    'CNN Internacional', 'CNN International', 'CNN Español', 'BBC News', 'BBC World',
    
    // Otros
    'Food Network HD', 'Golden HD', 'Space HD', 'Telemundo HD', 'Las Estrellas HD',
    'HOLA! TV HD', 'FUTV HD CR'
];

function reorganizeChannels() {
    try {
        // Leer el archivo CSV
        const csvContent = fs.readFileSync(csvFilePath, 'utf8');
        const lines = csvContent.split('\n');
        const header = lines[0];
        const dataLines = lines.slice(1).filter(line => line.trim() !== '');
        
        // Separar canales por categorías
        const peruvianChannels = [];
        const famousCableChannelsData = [];
        const otherChannels = [];
        
        dataLines.forEach(line => {
            const columns = line.split(',');
            if (columns.length < 6) return;
            
            const channelName = columns[1].replace(/"/g, '');
            const country = columns[5];
            
            // Verificar si es canal peruano
            if (country === 'Peru') {
                peruvianChannels.push(line);
            }
            // Verificar si es canal de cable famoso
            else if (famousCableChannels.some(famous => 
                channelName.toLowerCase().includes(famous.toLowerCase()) ||
                famous.toLowerCase().includes(channelName.toLowerCase())
            )) {
                famousCableChannelsData.push(line);
            }
            // Otros canales
            else {
                otherChannels.push(line);
            }
        });
        
        // Ordenar canales de cable famosos por prioridad
        famousCableChannelsData.sort((a, b) => {
            const nameA = a.split(',')[1].replace(/"/g, '');
            const nameB = b.split(',')[1].replace(/"/g, '');
            
            const priorityA = famousCableChannels.findIndex(famous => 
                nameA.toLowerCase().includes(famous.toLowerCase()) ||
                famous.toLowerCase().includes(nameA.toLowerCase())
            );
            const priorityB = famousCableChannels.findIndex(famous => 
                nameB.toLowerCase().includes(famous.toLowerCase()) ||
                famous.toLowerCase().includes(nameB.toLowerCase())
            );
            
            return priorityA - priorityB;
        });
        
        // Reorganizar: Header + Peruanos + Canales de Cable Famosos + Otros
        const reorganizedContent = [
            header,
            ...peruvianChannels,
            ...famousCableChannelsData,
            ...otherChannels
        ].join('\n');
        
        // Escribir el archivo reorganizado
        fs.writeFileSync(csvFilePath, reorganizedContent, 'utf8');
        
        console.log('✅ Archivo channels.csv reorganizado exitosamente');
        console.log(`📊 Estadísticas:`);
        console.log(`   - Canales peruanos: ${peruvianChannels.length}`);
        console.log(`   - Canales de cable famosos: ${famousCableChannelsData.length}`);
        console.log(`   - Otros canales: ${otherChannels.length}`);
        console.log(`   - Total de canales: ${peruvianChannels.length + famousCableChannelsData.length + otherChannels.length}`);
        
        console.log('\n🎬 Canales de cable famosos encontrados:');
        famousCableChannelsData.slice(0, 20).forEach(line => {
            const channelName = line.split(',')[1].replace(/"/g, '');
            console.log(`   - ${channelName}`);
        });
        if (famousCableChannelsData.length > 20) {
            console.log(`   ... y ${famousCableChannelsData.length - 20} más`);
        }
        
    } catch (error) {
        console.error('❌ Error al reorganizar canales:', error.message);
        process.exit(1);
    }
}

// Ejecutar la reorganización
reorganizeChannels();