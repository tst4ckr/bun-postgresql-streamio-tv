import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Función para reorganizar canales para niños al inicio
function reorganizeKidsChannels() {
    const csvPath = path.join(__dirname, 'data', 'http.csv');
    
    try {
        // Leer el archivo CSV
        const csvContent = fs.readFileSync(csvPath, 'utf8');
        const lines = csvContent.split('\n');
        
        // Separar header y datos
        const header = lines[0];
        const dataLines = lines.slice(1).filter(line => line.trim() !== '');
        
        // Palabras clave para identificar canales para niños
        const kidsKeywords = [
            'kids', 'niños', 'infantil', 'children', 'cartoon', 'disney', 
            'nick', 'baby', 'anime', 'junior', 'teen', 'cartoonito',
            'discovery kids', 'babyfirst', 'bravo! kids', 'ebs kids',
            'kan kids', 'logos tv kids', 'majid', 'roya kids',
            'sts kids', 'teennick', 'tvcarib kids', 'wb kids',
            'xtrema cartoons', 'golden eagle cartoon'
        ];
        
        // Separar canales para niños y otros canales
        const kidsChannels = [];
        const otherChannels = [];
        
        dataLines.forEach(line => {
            const lowerLine = line.toLowerCase();
            const isKidsChannel = kidsKeywords.some(keyword => 
                lowerLine.includes(keyword.toLowerCase())
            );
            
            if (isKidsChannel) {
                kidsChannels.push(line);
            } else {
                otherChannels.push(line);
            }
        });
        
        // Reorganizar: header + canales para niños + otros canales
        const reorganizedLines = [
            header,
            ...kidsChannels,
            ...otherChannels
        ];
        
        // Escribir el archivo reorganizado
        const reorganizedContent = reorganizedLines.join('\n');
        fs.writeFileSync(csvPath, reorganizedContent, 'utf8');
        
        console.log('✅ Archivo http.csv reorganizado exitosamente');
        console.log(`📊 Estadísticas:`);
        console.log(`   - Total de canales: ${dataLines.length}`);
        console.log(`   - Canales para niños: ${kidsChannels.length}`);
        console.log(`   - Otros canales: ${otherChannels.length}`);
        
        // Mostrar algunos canales para niños encontrados
        console.log('\n🎯 Canales para niños encontrados:');
        kidsChannels.slice(0, 10).forEach((channel, index) => {
            const parts = channel.split(',');
            const name = parts[1] ? parts[1].replace(/"/g, '') : 'Sin nombre';
            console.log(`   ${index + 1}. ${name}`);
        });
        
        if (kidsChannels.length > 10) {
            console.log(`   ... y ${kidsChannels.length - 10} más`);
        }
        
    } catch (error) {
        console.error('❌ Error al reorganizar el archivo:', error.message);
        process.exit(1);
    }
}

// Ejecutar la reorganización
reorganizeKidsChannels();