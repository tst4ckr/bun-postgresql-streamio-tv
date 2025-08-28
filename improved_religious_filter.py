#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Filtro religioso mejorado para canales de TV
Utiliza patrones avanzados para detectar contenido religioso en nombres, dominios y fuentes
Basado en análisis de causa raíz y principios de filtrado de contenido
"""

import csv
import re
import urllib.parse
from typing import List, Dict, Set, Tuple, Optional
from dataclasses import dataclass

@dataclass
class FilterResult:
    """Resultado del análisis de filtrado"""
    is_religious: bool
    confidence: float
    reasons: List[str]
    matched_terms: List[str]
    channel_info: Dict[str, str]

class ImprovedReligiousFilter:
    """Filtro religioso avanzado con detección por patrones y dominios"""
    
    def __init__(self):
        self.high_precision_keywords = self._get_high_precision_keywords()
        self.context_dependent_keywords = self._get_context_dependent_keywords()
        self.religious_domains = self._get_religious_domains()
        self.religious_patterns = self._compile_patterns()
        
    def _get_high_precision_keywords(self) -> Set[str]:
        """Palabras clave de alta precisión que indican contenido religioso"""
        return {
            # Español - Términos religiosos específicos
            'iglesia', 'pastor', 'predicador', 'sermon', 'biblia', 'evangelio',
            'cristiano', 'catolico', 'protestante', 'pentecostal', 'bautista',
            'metodista', 'adventista', 'testigo', 'jehova', 'mormon', 'mision',
            'ministerio', 'apostol', 'profeta', 'sacerdote', 'obispo', 'papa',
            'vaticano', 'templo', 'catedral', 'capilla', 'santuario', 'altar',
            'cruz', 'crucifijo', 'rosario', 'oracion', 'rezo', 'bendicion',
            'milagro', 'santo', 'santa', 'virgen', 'maria', 'jesus', 'cristo',
            'dios', 'señor', 'espiritu', 'trinidad', 'salvacion', 'pecado',
            'perdon', 'gracia', 'gloria', 'aleluya', 'amen', 'hosanna',
            'diocesano', 'parroquia', 'feligres', 'misa', 'eucaristia',
            'comunion', 'confesion', 'bautismo', 'confirmacion', 'matrimonio',
            'ordenacion', 'novena', 'via crucis', 'resurreccion', 'ascension',
            'pentecostes', 'navidad', 'pascua', 'cuaresma', 'adviento',
            
            # English - Religious terms
            'church', 'pastor', 'preacher', 'sermon', 'bible', 'gospel',
            'christian', 'catholic', 'protestant', 'pentecostal', 'baptist',
            'methodist', 'adventist', 'witness', 'jehovah', 'mormon', 'mission',
            'ministry', 'apostle', 'prophet', 'priest', 'bishop', 'pope',
            'vatican', 'temple', 'cathedral', 'chapel', 'sanctuary', 'altar',
            'cross', 'crucifix', 'rosary', 'prayer', 'blessing', 'miracle',
            'saint', 'virgin', 'mary', 'jesus', 'christ', 'god', 'lord',
            'spirit', 'trinity', 'salvation', 'sin', 'forgiveness', 'grace',
            'glory', 'hallelujah', 'amen', 'hosanna', 'diocese', 'parish',
            'mass', 'eucharist', 'communion', 'confession', 'baptism',
            'confirmation', 'ordination', 'resurrection', 'ascension',
            'christmas', 'easter', 'lent', 'advent',
            
            # Términos específicos de canales religiosos conocidos
            '3abn', 'ewtn', 'tbn', 'enlace', 'hope channel', 'novo tempo',
            'nuevo tiempo', 'tv universal', 'tv cancao nova', 'terceiro anjo',
            'sat 7', 'canal luz', 'canal diocesano', 'canal santa maria',
            'bethel', 'caritas', 'iurd', 'padre cicero', 'santa cecilia',
            
            # Términos islámicos
            'islam', 'muslim', 'quran', 'allah', 'muhammad', 'mosque',
            'imam', 'hajj', 'ramadan', 'eid', 'salah', 'zakat', 'shahada',
            'mecca', 'medina', 'islamic', 'islámico', 'mezquita', 'corán',
            
            # Términos judíos
            'jewish', 'judaism', 'torah', 'synagogue', 'rabbi', 'kosher',
            'shabbat', 'passover', 'yom kippur', 'hanukkah', 'judío', 'judaísmo',
            'sinagoga', 'rabino', 'shabat',
            
            # Términos hindúes y budistas
            'hindu', 'hinduism', 'buddha', 'buddhism', 'meditation', 'karma',
            'dharma', 'yoga', 'mantra', 'temple', 'monastery', 'monk',
            'hindú', 'hinduismo', 'buda', 'budismo', 'meditación', 'monasterio',
            'monje'
        }
    
    def _get_context_dependent_keywords(self) -> Set[str]:
        """Palabras que requieren contexto adicional para confirmar contenido religioso"""
        return {
            'fe', 'esperanza', 'amor', 'paz', 'vida', 'luz', 'camino',
            'faith', 'hope', 'love', 'peace', 'life', 'light', 'way',
            'angel', 'anjo', 'cielo', 'heaven', 'eternal', 'eterno',
            'divine', 'divino', 'sacred', 'sagrado', 'holy', 'santo'
        }
    
    def _get_religious_domains(self) -> Set[str]:
        """Dominios y subdominios que indican contenido religioso"""
        return {
            'iglesia', 'church', 'gospel', 'christian', 'catolico', 'catholic',
            'evangelico', 'evangelical', 'pentecostal', 'bautista', 'baptist',
            'metodista', 'methodist', 'adventista', 'adventist', 'mormon',
            'testigo', 'jehova', 'jehovah', 'ministerio', 'ministry',
            'mision', 'mission', 'templo', 'temple', 'biblia', 'bible',
            'cristo', 'christ', 'jesus', 'dios', 'god', 'santo', 'saint',
            'diocesis', 'diocese', 'parroquia', 'parish', 'vaticano', 'vatican',
            'ewtn', 'tbn', '3abn', 'enlace', 'hopechannel', 'novotempo',
            'nuevotiempo', 'tvuniversal', 'cancaonova', 'terceiroanjo',
            'sat7', 'canalluz', 'canaldiocesano', 'canalsantamaria',
            'bethel', 'caritas', 'iurd', 'padrecicero', 'santacecilia',
            'islamic', 'islamico', 'muslim', 'mezquita', 'mosque',
            'jewish', 'judaism', 'synagogue', 'sinagoga', 'torah',
            'hindu', 'hinduism', 'buddha', 'buddhism', 'monastery'
        }
    
    def _compile_patterns(self) -> List[re.Pattern]:
        """Compila patrones regex para detección avanzada"""
        patterns = [
            # Patrones para canales religiosos específicos
            re.compile(r'\b(canal|tv|television)\s+(religios|cristian|catolico|evangelico)', re.IGNORECASE),
            re.compile(r'\b(radio|tv)\s+(iglesia|church|gospel)', re.IGNORECASE),
            re.compile(r'\b(padre|pastor|bishop|obispo)\s+\w+', re.IGNORECASE),
            re.compile(r'\b(santa?|saint)\s+\w+', re.IGNORECASE),
            re.compile(r'\b(virgen|virgin)\s+(maria|mary)', re.IGNORECASE),
            re.compile(r'\b(jesus|christ|cristo)\s+(tv|radio|canal)', re.IGNORECASE),
            re.compile(r'\b(dios|god)\s+(tv|radio|canal)', re.IGNORECASE),
            
            # Patrones para organizaciones religiosas
            re.compile(r'\b(ministerio|ministry)\s+\w+', re.IGNORECASE),
            re.compile(r'\b(mision|mission)\s+\w+', re.IGNORECASE),
            re.compile(r'\b(iglesia|church)\s+\w+', re.IGNORECASE),
            
            # Patrones para contenido islámico
            re.compile(r'\b(al|el)\s+(islam|quran|coran)', re.IGNORECASE),
            re.compile(r'\bmosque\s+\w+', re.IGNORECASE),
            
            # Patrones para evitar falsos positivos
            re.compile(r'\btelefe\b', re.IGNORECASE),  # No es religioso
            re.compile(r'\bcafe\b', re.IGNORECASE),    # No es religioso
        ]
        return patterns
    
    def _extract_domain(self, url: str) -> str:
        """Extrae el dominio de una URL"""
        if not url or not isinstance(url, str):
            return ''
        
        try:
            # Agregar esquema si no existe
            if not url.startswith(('http://', 'https://')):
                url = f'http://{url}'
            
            parsed = urllib.parse.urlparse(url)
            domain = parsed.netloc.lower()
            
            # Remover puerto si existe
            if ':' in domain:
                domain = domain.split(':')[0]
            
            return domain
        except Exception:
            return url.lower()
    
    def _analyze_text(self, text: str) -> Tuple[bool, float, List[str], List[str]]:
        """Analiza texto para detectar contenido religioso"""
        if not text:
            return False, 0.0, [], []
        
        text_lower = text.lower()
        matched_terms = []
        reasons = []
        confidence = 0.0
        
        # Verificar palabras de alta precisión
        high_precision_matches = []
        for keyword in self.high_precision_keywords:
            if keyword in text_lower:
                high_precision_matches.append(keyword)
                matched_terms.append(keyword)
                confidence += 0.8
        
        if high_precision_matches:
            reasons.append('high_precision_keywords')
        
        # Verificar patrones regex
        pattern_matches = []
        for pattern in self.religious_patterns:
            matches = pattern.findall(text)
            if matches:
                pattern_matches.extend(matches)
                matched_terms.extend([str(m) for m in matches])
                confidence += 0.6
        
        if pattern_matches:
            reasons.append('pattern_match')
        
        # Verificar palabras dependientes de contexto
        context_matches = []
        for keyword in self.context_dependent_keywords:
            if keyword in text_lower:
                # Solo considerar si hay otras señales religiosas
                if high_precision_matches or pattern_matches:
                    context_matches.append(keyword)
                    matched_terms.append(keyword)
                    confidence += 0.3
        
        if context_matches:
            reasons.append('context_keywords')
        
        # Normalizar confianza
        confidence = min(confidence, 1.0)
        
        is_religious = confidence >= 0.5
        
        return is_religious, confidence, reasons, matched_terms
    
    def _analyze_domain(self, url: str) -> Tuple[bool, float, List[str], List[str]]:
        """Analiza dominio para detectar contenido religioso"""
        domain = self._extract_domain(url)
        if not domain:
            return False, 0.0, [], []
        
        matched_terms = []
        reasons = []
        confidence = 0.0
        
        # Verificar dominios religiosos conocidos
        for religious_domain in self.religious_domains:
            if religious_domain in domain:
                matched_terms.append(religious_domain)
                confidence += 0.9
                reasons.append('religious_domain')
        
        # Verificar subdominios
        domain_parts = domain.split('.')
        for part in domain_parts:
            if part in self.religious_domains:
                matched_terms.append(part)
                confidence += 0.7
                if 'religious_subdomain' not in reasons:
                    reasons.append('religious_subdomain')
        
        confidence = min(confidence, 1.0)
        is_religious = confidence >= 0.6
        
        return is_religious, confidence, reasons, matched_terms
    
    def analyze_channel(self, channel_data: Dict[str, str]) -> FilterResult:
        """Analiza un canal completo para determinar si es religioso"""
        # Extraer información del canal
        name = channel_data.get('name', '')
        url = channel_data.get('url', '')
        category = channel_data.get('category', '')
        group = channel_data.get('group', '')
        description = channel_data.get('description', '')
        
        # Combinar todo el texto para análisis
        combined_text = f"{name} {category} {group} {description}".strip()
        
        # Analizar texto
        text_religious, text_confidence, text_reasons, text_matches = self._analyze_text(combined_text)
        
        # Analizar dominio
        domain_religious, domain_confidence, domain_reasons, domain_matches = self._analyze_domain(url)
        
        # Combinar resultados
        is_religious = text_religious or domain_religious
        confidence = max(text_confidence, domain_confidence)
        reasons = list(set(text_reasons + domain_reasons))
        matched_terms = list(set(text_matches + domain_matches))
        
        # Ajustar confianza si ambos análisis coinciden
        if text_religious and domain_religious:
            confidence = min(confidence * 1.2, 1.0)
        
        return FilterResult(
            is_religious=is_religious,
            confidence=confidence,
            reasons=reasons,
            matched_terms=matched_terms,
            channel_info={
                'name': name,
                'url': url,
                'category': category,
                'group': group,
                'description': description
            }
        )
    
    def filter_csv(self, input_file: str, output_file: str, confidence_threshold: float = 0.5) -> Dict[str, any]:
        """Filtra canales religiosos de un archivo CSV"""
        filtered_channels = []
        remaining_channels = []
        total_channels = 0
        
        try:
            with open(input_file, 'r', encoding='utf-8', newline='') as infile:
                reader = csv.reader(infile)
                
                for row in reader:
                    total_channels += 1
                    
                    if len(row) >= 2:
                        # Mapear columnas del CSV
                        channel_data = {
                            'name': row[1] if len(row) > 1 else '',
                            'url': row[0] if len(row) > 0 else '',
                            'category': row[2] if len(row) > 2 else '',
                            'group': row[3] if len(row) > 3 else '',
                            'description': row[4] if len(row) > 4 else ''
                        }
                        
                        # Analizar canal
                        result = self.analyze_channel(channel_data)
                        
                        if result.is_religious and result.confidence >= confidence_threshold:
                            filtered_channels.append({
                                'row': row,
                                'result': result
                            })
                            print(f"Canal religioso filtrado: {result.channel_info['name']} (confianza: {result.confidence:.2f})")
                            print(f"  Razones: {', '.join(result.reasons)}")
                            print(f"  Términos: {', '.join(result.matched_terms)}")
                        else:
                            remaining_channels.append(row)
                    else:
                        # Mantener filas con formato incompleto
                        remaining_channels.append(row)
            
            # Escribir archivo filtrado
            with open(output_file, 'w', encoding='utf-8', newline='') as outfile:
                writer = csv.writer(outfile)
                writer.writerows(remaining_channels)
            
            return {
                'total_channels': total_channels,
                'filtered_channels': len(filtered_channels),
                'remaining_channels': len(remaining_channels),
                'filtered_details': filtered_channels
            }
        
        except Exception as e:
            print(f"Error procesando archivo: {e}")
            return {'error': str(e)}

def main():
    """Función principal"""
    # Configuración de archivos
    input_file = r'c:\Users\Ankel\Documents\HAZ-BUN-TV-PROD\bun-postgresql-streamio-tv\data\http_no_bitel.csv'
    output_file = r'c:\Users\Ankel\Documents\HAZ-BUN-TV-PROD\bun-postgresql-streamio-tv\data\http_no_religious.csv'
    
    print("=== FILTRO RELIGIOSO MEJORADO ===")
    print(f"Archivo de entrada: {input_file}")
    print(f"Archivo de salida: {output_file}")
    print()
    
    # Crear filtro
    filter_engine = ImprovedReligiousFilter()
    
    # Ejecutar filtrado
    print("Iniciando análisis de canales religiosos...")
    stats = filter_engine.filter_csv(input_file, output_file, confidence_threshold=0.5)
    
    if 'error' in stats:
        print(f"Error: {stats['error']}")
        return 1
    
    # Mostrar estadísticas
    print("\n=== ESTADÍSTICAS DEL FILTRADO ===")
    print(f"Total de canales procesados: {stats['total_channels']}")
    print(f"Canales religiosos eliminados: {stats['filtered_channels']}")
    print(f"Canales restantes: {stats['remaining_channels']}")
    
    if stats['total_channels'] > 0:
        percentage = (stats['filtered_channels'] / stats['total_channels']) * 100
        print(f"Porcentaje eliminado: {percentage:.2f}%")
    
    print(f"\nArchivo filtrado guardado como: {output_file}")
    print("Proceso completado exitosamente.")
    
    return 0

if __name__ == '__main__':
    exit(main())