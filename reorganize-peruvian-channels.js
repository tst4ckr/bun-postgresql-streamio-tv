import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Script para reorganizar channels.csv colocando los canales peruanos al inicio
 */
function reorganizeChannelsCSV() {
    const inputFile = path.join(__dirname, 'data', 'channels.csv');
    const outputFile = path.join(__dirname, 'data', 'channels.csv');
    
    try {
        // Leer el archivo CSV
        const csvContent = fs.readFileSync(inputFile, 'utf8');
        const lines = csvContent.split('\n');
        
        // Separar header y datos
        const header = lines[0];
        const dataLines = lines.slice(1).filter(line => line.trim() !== '');
        
        // Separar canales peruanos y otros canales
        const peruvianChannels = [];
        const otherChannels = [];
        
        dataLines.forEach(line => {
            if (line.includes(',Peru,')) {
                peruvianChannels.push(line);
            } else {
                otherChannels.push(line);
            }
        });
        
        // Reorganizar: header + canales peruanos + otros canales
        const reorganizedLines = [
            header,
            ...peruvianChannels,
            ...otherChannels
        ];
        
        // Escribir el archivo reorganizado
        const reorganizedContent = reorganizedLines.join('\n');
        fs.writeFileSync(outputFile, reorganizedContent, 'utf8');
        
        console.log('✅ Archivo channels.csv reorganizado exitosamente');
        console.log(`📊 Estadísticas:`);
        console.log(`   • Total de canales: ${dataLines.length}`);
        console.log(`   • Canales peruanos: ${peruvianChannels.length}`);
        console.log(`   • Otros canales: ${otherChannels.length}`);
        
        console.log('\n🇵🇪 Canales peruanos encontrados:');
        peruvianChannels.forEach((channel, index) => {
            const parts = channel.split(',');
            const name = parts[1]?.replace(/"/g, '') || 'Sin nombre';
            console.log(`   ${index + 1}. ${name}`);
        });
        
    } catch (error) {
        console.error('❌ Error al reorganizar el archivo:', error.message);
        process.exit(1);
    }
}

// Ejecutar el script
reorganizeChannelsCSV();