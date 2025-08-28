#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para filtrar canales de TV eliminando aquellos con dominios de Rusia, países árabes o cercanos.
Utiliza pandas para el procesamiento eficiente de datos CSV.
"""

import pandas as pd
import re
from urllib.parse import urlparse
import sys
import os

def extract_domain(url):
    """Extrae el dominio de una URL."""
    try:
        if not url or pd.isna(url):
            return ''
        
        # Asegurar que la URL tenga un esquema
        if not url.startswith(('http://', 'https://')):
            url = 'http://' + url
        
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        
        # Remover puerto si existe
        if ':' in domain:
            domain = domain.split(':')[0]
        
        return domain
    except Exception:
        return ''

def is_problematic_domain(domain):
    """Determina si un dominio es problemático (Rusia, países árabes, cercanos)."""
    if not domain:
        return False
    
    domain = domain.lower()
    
    # Dominios rusos
    russian_domains = [
        '.ru', '.рф',  # Dominios de Rusia
        'russia', 'moscow', 'kremlin',
        'rtvi', 'rt.com', 'sputnik',
        'vesti', 'channel1', 'ntv.ru'
    ]
    
    # Dominios árabes y países cercanos
    arab_domains = [
        '.ae', '.sa', '.qa', '.kw', '.bh', '.om',  # Países del Golfo
        '.eg', '.ly', '.tn', '.ma', '.dz',         # Norte de África
        '.sy', '.lb', '.jo', '.iq', '.ye',         # Levante y otros
        '.ir', '.af', '.pk',                       # Países cercanos
        'aljazeera', 'alarabiya', 'mbc', 'lbc',
        'dubai', 'abu', 'qatar', 'kuwait',
        'saudi', 'emirates', 'bahrain',
        'tehran', 'kabul', 'islamabad'
    ]
    
    # Dominios de países de la ex-URSS y cercanos
    eastern_domains = [
        '.by', '.ua', '.kz', '.uz', '.kg', '.tj', '.tm',  # Ex-URSS
        '.ge', '.am', '.az', '.md',                        # Cáucaso y Moldavia
        '.mn', '.cn',                                      # Mongolia, China
        'belarus', 'ukraine', 'kazakhstan', 'uzbekistan',
        'georgia', 'armenia', 'azerbaijan', 'moldova'
    ]
    
    # Verificar caracteres cirílicos
    cyrillic_pattern = re.compile(r'[а-яё]', re.IGNORECASE)
    if cyrillic_pattern.search(domain):
        return True
    
    # Verificar dominios problemáticos
    all_problematic = russian_domains + arab_domains + eastern_domains
    
    for problematic in all_problematic:
        if problematic in domain:
            return True
    
    return False

def filter_channels(input_file, output_file):
    """Filtra el archivo CSV eliminando canales con dominios problemáticos."""
    try:
        # Leer el archivo CSV
        print(f"Leyendo archivo: {input_file}")
        df = pd.read_csv(input_file)
        
        print(f"Total de canales antes del filtrado: {len(df)}")
        
        # Extraer dominios de las URLs
        df['domain'] = df['url'].apply(extract_domain)
        
        # Identificar canales problemáticos
        df['is_problematic'] = df['domain'].apply(is_problematic_domain)
        
        # Contar canales problemáticos
        problematic_count = df['is_problematic'].sum()
        print(f"Canales problemáticos encontrados: {problematic_count}")
        
        # Mostrar algunos ejemplos de dominios problemáticos
        if problematic_count > 0:
            print("\nEjemplos de dominios problemáticos encontrados:")
            problematic_domains = df[df['is_problematic']]['domain'].unique()[:10]
            for domain in problematic_domains:
                if domain:  # Solo mostrar dominios no vacíos
                    print(f"  - {domain}")
        
        # Filtrar canales (mantener solo los no problemáticos)
        df_filtered = df[~df['is_problematic']].copy()
        
        # Eliminar columnas auxiliares
        df_filtered = df_filtered.drop(['domain', 'is_problematic'], axis=1)
        
        print(f"Total de canales después del filtrado: {len(df_filtered)}")
        print(f"Canales eliminados: {len(df) - len(df_filtered)}")
        
        # Guardar archivo filtrado
        df_filtered.to_csv(output_file, index=False)
        print(f"\nArchivo filtrado guardado como: {output_file}")
        
        return True
        
    except Exception as e:
        print(f"Error al procesar el archivo: {str(e)}")
        return False

def main():
    """Función principal."""
    # Rutas de archivos
    input_file = "data/http.csv"
    output_file = "data/http_filtered.csv"
    
    # Verificar que el archivo de entrada existe
    if not os.path.exists(input_file):
        print(f"Error: El archivo {input_file} no existe.")
        sys.exit(1)
    
    # Crear directorio de salida si no existe
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    # Filtrar canales
    success = filter_channels(input_file, output_file)
    
    if success:
        print("\n✅ Filtrado completado exitosamente.")
    else:
        print("\n❌ Error durante el filtrado.")
        sys.exit(1)

if __name__ == "__main__":
    main()