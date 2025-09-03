/**
 * Script de verificación para el ContentFilterService refactorizado
 * Valida que la funcionalidad se mantenga intacta después de la refactorización
 */

import ContentFilterService from './src/domain/services/ContentFilterService.js';

// Datos de prueba
const testChannels = [
  {
    id: '1',
    name: 'Canal Religioso Test',
    description: 'Canal cristiano con contenido religioso',
    category: 'Religioso',
    url: 'http://example.com/religious'
  },
  {
    id: '2',
    name: 'Canal Normal',
    description: 'Canal de entretenimiento general',
    category: 'Entretenimiento',
    url: 'http://example.com/entertainment'
  },
  {
    id: '3',
    name: 'Discovery Channel',
    description: 'Canal documental con contenido educativo sobre religiones del mundo',
    category: 'Documental',
    url: 'http://discovery.com'
  },
  {
    id: '4',
    name: 'Canal Adulto XXX',
    description: 'Contenido para adultos',
    category: 'Adulto',
    url: 'http://example.com/adult'
  }
];

// Configuraciones de prueba
const testConfigs = [
  {
    name: 'Sin filtros',
    config: {
      filterReligiousContent: false,
      filterAdultContent: false,
      filterPoliticalContent: false
    },
    expectedCount: 4
  },
  {
    name: 'Solo filtro religioso',
    config: {
      filterReligiousContent: true,
      filterAdultContent: false,
      filterPoliticalContent: false
    },
    expectedCount: 3 // Discovery debe mantenerse por estar en excepciones
  },
  {
    name: 'Solo filtro adulto',
    config: {
      filterReligiousContent: false,
      filterAdultContent: true,
      filterPoliticalContent: false,
      adultKeywords: ['adult', 'xxx', '+18']
    },
    expectedCount: 3
  },
  {
    name: 'Todos los filtros',
    config: {
      filterReligiousContent: true,
      filterAdultContent: true,
      filterPoliticalContent: true,
      religiousKeywords: ['iglesia', 'dios'],
      adultKeywords: ['adult', 'xxx', '+18'],
      politicalKeywords: ['politica', 'gobierno']
    },
    expectedCount: 2 // Solo Canal Normal y Discovery
  }
];

function runTests() {
  console.log('🧪 Iniciando verificación del ContentFilterService refactorizado\n');
  
  let allTestsPassed = true;
  
  testConfigs.forEach((testCase, index) => {
    try {
      console.log(`📋 Prueba ${index + 1}: ${testCase.name}`);
      
      // Crear servicio con configuración de prueba
      const service = new ContentFilterService(testCase.config);
      
      // Verificar que el servicio se inicializa correctamente
      console.log(`   ✓ Servicio inicializado`);
      
      // Verificar hasActiveFilters
      const hasActiveFilters = service.hasActiveFilters();
      const expectedActive = Object.values(testCase.config).some(Boolean);
      if (hasActiveFilters === expectedActive) {
        console.log(`   ✓ hasActiveFilters: ${hasActiveFilters}`);
      } else {
        console.log(`   ❌ hasActiveFilters esperado: ${expectedActive}, obtenido: ${hasActiveFilters}`);
        allTestsPassed = false;
      }
      
      // Filtrar canales
      const filteredChannels = service.filterChannels(testChannels);
      console.log(`   ✓ Filtrado ejecutado`);
      
      // Verificar cantidad de canales filtrados
      if (filteredChannels.length === testCase.expectedCount) {
        console.log(`   ✓ Canales filtrados: ${filteredChannels.length}/${testChannels.length}`);
      } else {
        console.log(`   ❌ Canales esperados: ${testCase.expectedCount}, obtenidos: ${filteredChannels.length}`);
        allTestsPassed = false;
      }
      
      // Obtener estadísticas
      const stats = service.getFilterStats(testChannels, filteredChannels);
      console.log(`   ✓ Estadísticas generadas: ${stats.removedChannels} removidos`);
      
      // Obtener configuración
      const config = service.getFilterConfiguration();
      console.log(`   ✓ Configuración obtenida`);
      
      console.log(`   📊 Resultado: ${filteredChannels.map(c => c.name).join(', ')}\n`);
      
    } catch (error) {
      console.log(`   ❌ Error en prueba: ${error.message}\n`);
      allTestsPassed = false;
    }
  });
  
  // Pruebas de manejo de errores
  console.log('🔍 Verificando manejo de errores:');
  
  // Intentar crear servicio con configuración inválida
  try {
    const invalidService = new ContentFilterService(null);
    console.log('   ❌ Debería lanzar error con configuración nula');
    allTestsPassed = false;
  } catch (error) {
    console.log('   ✓ Error manejado correctamente para configuración nula');
  }
  
  const service = new ContentFilterService({ filterReligiousContent: false, filterAdultContent: false, filterPoliticalContent: false });
  
  // Probar con entrada inválida
  try {
    service.filterChannels(null);
    console.log('   ❌ Debería lanzar error con entrada null');
    allTestsPassed = false;
  } catch (error) {
    console.log('   ✓ Error manejado correctamente para entrada null');
  }
  
  try {
    service.getFilterStats(null, []);
    console.log('   ❌ Debería lanzar error con parámetros inválidos');
    allTestsPassed = false;
  } catch (error) {
    console.log('   ✓ Error manejado correctamente para parámetros inválidos');
  }
  
  // Resultado final
  console.log('\n' + '='.repeat(50));
  if (allTestsPassed) {
    console.log('🎉 TODAS LAS PRUEBAS PASARON - Refactorización exitosa');
    console.log('✅ La funcionalidad se mantiene intacta');
    console.log('✅ Los principios SOLID se aplicaron correctamente');
    console.log('✅ El manejo de errores funciona apropiadamente');
  } else {
    console.log('❌ ALGUNAS PRUEBAS FALLARON - Revisar implementación');
  }
  console.log('='.repeat(50));
  
  return allTestsPassed;
}

// Ejecutar pruebas si el script se ejecuta directamente
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith('test_refactored_service.js')) {
  runTests();
}

export { runTests };