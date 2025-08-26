import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración mejorada de palabras clave religiosas
const IMPROVED_RELIGIOUS_KEYWORDS = {
  // Palabras específicamente religiosas (alta precisión)
  high_precision: [
    'iglesia', 'pastor', 'predicador', 'sermon', 'biblia', 'evangelio',
    'cristiano', 'catolico', 'protestante', 'pentecostal', 'bautista',
    'metodista', 'adventista', 'testigo', 'jehova', 'mormon', 'mision',
    'ministerio', 'apostol', 'profeta', 'sacerdote', 'obispo', 'papa',
    'vaticano', 'templo', 'catedral', 'capilla', 'santuario', 'altar',
    'cruz', 'crucifijo', 'rosario', 'oracion', 'rezo', 'bendicion',
    'milagro', 'santo', 'santa', 'virgen', 'maria', 'jesus', 'cristo',
    'dios', 'señor', 'espiritu', 'trinidad', 'salvacion', 'pecado',
    'perdon', 'gracia', 'gloria', 'aleluya', 'amen', 'hosanna',
    'gospel', 'church', 'christian', 'catholic', 'protestant', 'baptist',
    'methodist', 'pentecostal', 'evangelical', 'apostolic', 'ministry',
    'pastor', 'priest', 'bishop', 'pope', 'temple', 'cathedral',
    'chapel', 'sanctuary', 'altar', 'cross', 'prayer', 'blessing',
    'miracle', 'saint', 'virgin', 'mary', 'jesus', 'christ', 'god',
    'lord', 'spirit', 'trinity', 'salvation', 'sin', 'forgiveness',
    'grace', 'glory', 'hallelujah', 'amen', 'hosanna'
  ],
  
  // Palabras que requieren contexto (pueden ser falsos positivos)
  context_dependent: [
    'fe', 'esperanza', 'amor', 'paz', 'vida', 'luz', 'camino',
    'faith', 'hope', 'love', 'peace', 'life', 'light', 'way'
  ],
  
  // Dominios y URLs religiosos
  religious_domains: [
    'iglesia', 'church', 'gospel', 'christian', 'catolico', 'catholic',
    'evangelico', 'evangelical', 'pentecostal', 'bautista', 'baptist',
    'metodista', 'methodist', 'adventista', 'adventist', 'mormon',
    'testigo', 'jehova', 'jehovah', 'ministerio', 'ministry',
    'mision', 'mission', 'templo', 'temple', 'biblia', 'bible',
    'cristo', 'christ', 'jesus', 'dios', 'god', 'santo', 'saint'
  ]
};

// Función para extraer dominio de URL
function extractDomain(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `http://${url}`);
    return urlObj.hostname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

// Función mejorada para detectar contenido religioso
function isReligiousContent(channel) {
  const text = [
    channel.name || '',
    channel.title || '',
    channel.description || '',
    channel.category || '',
    channel.group || '',
    channel.genres || ''
  ].join(' ').toLowerCase();
  
  const url = channel.url || '';
  const stream = channel.stream || '';
  const domain = extractDomain(url) + ' ' + extractDomain(stream);
  
  // Verificar palabras de alta precisión en texto
  const hasHighPrecisionKeyword = IMPROVED_RELIGIOUS_KEYWORDS.high_precision.some(keyword => 
    text.includes(keyword.toLowerCase())
  );
  
  // Verificar dominios religiosos
  const hasReligiousDomain = IMPROVED_RELIGIOUS_KEYWORDS.religious_domains.some(keyword => 
    domain.includes(keyword.toLowerCase())
  );
  
  // Verificar palabras dependientes de contexto (solo si hay otras señales)
  const hasContextKeyword = IMPROVED_RELIGIOUS_KEYWORDS.context_dependent.some(keyword => {
    const keywordLower = keyword.toLowerCase();
    // Evitar falsos positivos como "Telefe" para "fe"
    if (keywordLower === 'fe') {
      // Solo considerar "fe" si está como palabra completa o en contexto religioso
      const fePattern = /\bfe\b|\bfaith\b/i;
      return fePattern.test(text) && (hasHighPrecisionKeyword || hasReligiousDomain);
    }
    return text.includes(keywordLower);
  });
  
  const result = {
    isReligious: hasHighPrecisionKeyword || hasReligiousDomain || (hasContextKeyword && (hasHighPrecisionKeyword || hasReligiousDomain)),
    reasons: [],
    channel: {
      name: channel.name,
      url: channel.url,
      stream: channel.stream,
      category: channel.category,
      group: channel.group
    }
  };
  
  if (hasHighPrecisionKeyword) result.reasons.push('high_precision_keyword');
  if (hasReligiousDomain) result.reasons.push('religious_domain');
  if (hasContextKeyword) result.reasons.push('context_keyword');
  
  return result;
}

// Función para analizar canales desde CSV
function analyzeCSVChannels() {
  const csvPath = path.join(__dirname, 'data', 'channels.csv');
  const csvContent = readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').slice(1); // Skip header
  
  const religiousChannels = [];
  const falsePositives = [];
  
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    
    const [name, url, category, group, description] = line.split(',').map(field => 
      field ? field.replace(/^"|"$/g, '').trim() : ''
    );
    
    const channel = { name, url, category, group, description };
    const analysis = isReligiousContent(channel);
    
    if (analysis.isReligious) {
      religiousChannels.push(analysis);
    } else if (channel.name && (channel.name.toLowerCase().includes('fe') || 
                               channel.name.toLowerCase().includes('faith'))) {
      falsePositives.push({
        name: channel.name,
        reason: 'Contains fe/faith but not classified as religious'
      });
    }
  });
  
  return { religiousChannels, falsePositives };
}

// Función principal
function main() {
  console.log('🔍 Analizando mejoras en filtrado religioso...');
  
  const { religiousChannels, falsePositives } = analyzeCSVChannels();
  
  console.log(`\n📊 Resultados del análisis:`);
  console.log(`- Canales religiosos detectados: ${religiousChannels.length}`);
  console.log(`- Posibles falsos positivos evitados: ${falsePositives.length}`);
  
  if (religiousChannels.length > 0) {
    console.log('\n🔴 Canales religiosos encontrados:');
    religiousChannels.forEach((analysis, index) => {
      console.log(`${index + 1}. ${analysis.channel.name}`);
      console.log(`   Razones: ${analysis.reasons.join(', ')}`);
      console.log(`   URL: ${analysis.channel.url || 'N/A'}`);
      console.log(`   Categoría: ${analysis.channel.category || 'N/A'}`);
      console.log(`   Grupo: ${analysis.channel.group || 'N/A'}`);
      console.log('');
    });
  }
  
  if (falsePositives.length > 0) {
    console.log('\n✅ Falsos positivos evitados:');
    falsePositives.forEach((fp, index) => {
      console.log(`${index + 1}. ${fp.name} - ${fp.reason}`);
    });
  }
  
  // Generar configuración mejorada
  console.log('\n📝 Configuración mejorada de palabras clave:');
  console.log('RELIGIOUS_KEYWORDS="' + IMPROVED_RELIGIOUS_KEYWORDS.high_precision.join(',') + '"');
  
  console.log('\n🌐 Palabras clave para dominios:');
  console.log('RELIGIOUS_DOMAIN_KEYWORDS="' + IMPROVED_RELIGIOUS_KEYWORDS.religious_domains.join(',') + '"');
}

main();