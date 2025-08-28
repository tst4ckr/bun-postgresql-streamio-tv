// Script para debuggear el cálculo de similitud específicamente

function calculateStringSimilarity(str1, str2) {
  console.log(`\n=== Calculando similitud entre "${str1}" y "${str2}" ===`);
  
  if (str1 === str2) {
    console.log('Son idénticas -> 1.0');
    return 1.0;
  }
  
  if (str1.length === 0 || str2.length === 0) {
    console.log('Una cadena está vacía -> 0.0');
    return 0.0;
  }

  // Verificar si ambas cadenas contienen números al final
  const hasNumber1 = /\d+$/.test(str1.trim());
  const hasNumber2 = /\d+$/.test(str2.trim());
  
  console.log(`¿Str1 tiene número al final?: ${hasNumber1}`);
  console.log(`¿Str2 tiene número al final?: ${hasNumber2}`);
  
  // Si ambas tienen números al final, deben ser exactamente iguales para ser consideradas duplicadas
  if (hasNumber1 && hasNumber2) {
    console.log('Ambas tienen números al final - requieren coincidencia exacta');
    return str1 === str2 ? 1.0 : 0.0;
  }

  // Verificar si uno es subcadena del otro (para casos como "CNN" vs "105-CNN")
  const shorter = str1.length < str2.length ? str1 : str2;
  const longer = str1.length < str2.length ? str2 : str1;
  
  console.log(`Cadena más corta: "${shorter}" (${shorter.length} chars)`);
  console.log(`Cadena más larga: "${longer}" (${longer.length} chars)`);
  console.log(`¿La larga contiene la corta?: ${longer.includes(shorter)}`);
  
  if (longer.includes(shorter) && shorter.length >= 3) {
    // Si la cadena más corta tiene números al final, ser más estricto
    if (hasNumber1 || hasNumber2) {
      console.log('Una cadena tiene números - verificando si es solo prefijo numérico');
      // Solo considerar duplicado si la diferencia es solo prefijos numéricos
      const withoutPrefix = longer.replace(/^\d+/, '');
      console.log(`Cadena larga sin prefijo: "${withoutPrefix}"`);
      if (withoutPrefix === shorter) {
        const lengthRatio = shorter.length / longer.length;
        const similarity = Math.min(0.95, 0.7 + (lengthRatio * 0.25));
        console.log(`Prefijo numérico detectado - similitud: ${similarity.toFixed(3)}`);
        return similarity;
      }
      console.log('No es solo prefijo numérico -> 0.0');
      return 0.0;
    }
    
    // Bonus por subcadena, pero penalizar por diferencia de longitud
    const lengthRatio = shorter.length / longer.length;
    const similarity = Math.min(0.95, 0.7 + (lengthRatio * 0.25));
    console.log(`Subcadena detectada:`);
    console.log(`  - Ratio de longitud: ${lengthRatio.toFixed(3)}`);
    console.log(`  - Similitud calculada: ${similarity.toFixed(3)}`);
    return similarity;
  }

  // Algoritmo de distancia de Levenshtein normalizada
  const maxLength = Math.max(str1.length, str2.length);
  const distance = levenshteinDistance(str1, str2);
  const similarity = 1 - (distance / maxLength);
  
  console.log(`Distancia de Levenshtein: ${distance}`);
  console.log(`Longitud máxima: ${maxLength}`);
  console.log(`Similitud final: ${similarity.toFixed(3)}`);
  
  return similarity;
}

function levenshteinDistance(str1, str2) {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  return matrix[str2.length][str1.length];
}

function debugSimilarityCalculation() {
  console.log('=== DEBUG DE CÁLCULO DE SIMILITUD ===');
  
  const testCases = [
    ['fox sports 2', 'fox sports 3'],
    ['fox sports 2', '105fox sports 2'],
    ['fox sports', 'fox sports 2'],
    ['fox sports', 'fox sports 3'],
    ['cnn', '38cnn'],
    ['discovery channel', 'discovery channel 4k']
  ];
  
  const threshold = 0.85;
  console.log(`\nUmbral de similitud configurado: ${threshold}`);
  
  testCases.forEach(([str1, str2]) => {
    const similarity = calculateStringSimilarity(str1, str2);
    const isDuplicate = similarity >= threshold;
    console.log(`\n🔍 RESULTADO: Similitud ${(similarity * 100).toFixed(1)}% - ${isDuplicate ? '❌ DUPLICADO' : '✅ ÚNICO'}`);
    console.log('='.repeat(60));
  });
}

debugSimilarityCalculation();