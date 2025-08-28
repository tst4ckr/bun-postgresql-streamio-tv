#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para filtrar canales eliminando aquellos que contengan 'tv360.bitel' en su dominio.
Utiliza pandas para el procesamiento eficiente de datos CSV.
"""

import pandas as pd
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

def contains_bitel_domain(domain):
    """Determina si un dominio contiene 'tv360.bitel'."""
    if not domain:
        return False
    
    domain = domain.lower()
    return 'tv360.bitel' in domain

def filter_bitel_channels(input_file, output_file):
    """Filtra el archivo CSV eliminando canales con dominios que contengan 'tv360.bitel'."""
    try:
        # Leer el archivo CSV
        print(f"Leyendo archivo: {input_file}")
        df = pd.read_csv(input_file)
        
        print(f"Total de canales antes del filtrado: {len(df)}")
        
        # Extraer dominios de las URLs
        df['domain'] = df['url'].apply(extract_domain)
        
        # Identificar canales con dominios de Bitel
        df['has_bitel_domain'] = df['domain'].apply(contains_bitel_domain)
        
        # Contar canales con dominios de Bitel
        bitel_count = df['has_bitel_domain'].sum()
        print(f"Canales con dominios tv360.bitel encontrados: {bitel_count}")
        
        # Mostrar algunos ejemplos de canales con dominios de Bitel
        if bitel_count > 0:
            print("\nEjemplos de canales con dominios tv360.bitel:")
            bitel_channels = df[df['has_bitel_domain']]
            for _, channel in bitel_channels.head(10).iterrows():
                print(f"  - {channel['name']}: {channel['domain']}")
        
        # Filtrar canales (mantener solo los que NO tienen dominios de Bitel)
        df_filtered = df[~df['has_bitel_domain']].copy()
        
        # Eliminar columnas auxiliares
        df_filtered = df_filtered.drop(['domain', 'has_bitel_domain'], axis=1)
        
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
    input_file = "data/http_filtered.csv"  # Usar el archivo ya filtrado
    output_file = "data/http_no_bitel.csv"
    
    # Verificar que el archivo de entrada existe
    if not os.path.exists(input_file):
        print(f"Error: El archivo {input_file} no existe.")
        print("Intentando usar el archivo original...")
        input_file = "data/http.csv"
        if not os.path.exists(input_file):
            print(f"Error: El archivo {input_file} tampoco existe.")
            sys.exit(1)
    
    # Crear directorio de salida si no existe
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    # Filtrar canales
    success = filter_bitel_channels(input_file, output_file)
    
    if success:
        print("\n✅ Filtrado de canales Bitel completado exitosamente.")
    else:
        print("\n❌ Error durante el filtrado.")
        sys.exit(1)

if __name__ == "__main__":
    main()