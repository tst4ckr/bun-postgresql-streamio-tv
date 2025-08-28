#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para filtrar canales religiosos del archivo http.csv
Este script identifica y elimina canales con contenido religioso basándose en palabras clave.
"""

import csv
import re
from typing import List, Dict

def get_religious_keywords() -> List[str]:
    """
    Retorna lista de palabras clave que identifican canales religiosos.
    Basado en el análisis del archivo CSV actual.
    """
    return [
        # Términos religiosos generales
        '3abn', 'adventista', 'angel', 'anjo', 'bethel', 'canal cine dios',
        'canal diocesano', 'canal luz', 'canal oración', 'canal santa maría',
        'cáritas', 'católico', 'cristiano', 'dios', 'diocesano', 'enlace',
        'ewtn', 'gospel', 'hope channel', 'hosanna', 'iglesia', 'iurd',
        'jesus', 'novo tempo', 'nuevo tiempo', 'oración', 'padre cicero',
        'religioso', 'santa cecilia', 'santa maría', 'santo', 'sat 7',
        'tbn', 'terceiro anjo', 'tv cancao nova', 'tv universal',
        'diyanet', 'çocuk', 'solidaria', 'solidario'
    ]

def get_language_keywords() -> List[str]:
    """
    Retorna lista de palabras clave que identifican canales en árabe y ruso.
    """
    return [
        # Términos en árabe y ruso
        'arabic', 'russian', 'العربية', 'русский',
        'al jazeera arabic', 'al jazeera mubashe', 'trt', 'bahoriston'
    ]

def is_filtered_channel(channel_name: str, religious_keywords: List[str], language_keywords: List[str]) -> bool:
    """
    Determina si un canal debe ser filtrado basándose en su nombre.
    
    Args:
        channel_name: Nombre del canal a evaluar
        religious_keywords: Lista de palabras clave religiosas
        language_keywords: Lista de palabras clave de idiomas
    
    Returns:
        True si el canal debe ser filtrado, False en caso contrario
    """
    if not channel_name:
        return False
    
    # Convertir a minúsculas para comparación insensible a mayúsculas
    name_lower = channel_name.lower()
    
    # Buscar palabras clave religiosas en el nombre del canal
    for keyword in religious_keywords:
        if keyword.lower() in name_lower:
            return True
    
    # Buscar palabras clave de idiomas en el nombre del canal
    for keyword in language_keywords:
        if keyword.lower() in name_lower:
            return True
    
    return False

def filter_channels(input_file: str, output_file: str) -> Dict[str, int]:
    """
    Filtra canales religiosos y en árabe/ruso del archivo CSV.
    
    Args:
        input_file: Ruta del archivo CSV de entrada
        output_file: Ruta del archivo CSV de salida
    
    Returns:
        Diccionario con estadísticas del filtrado
    """
    religious_keywords = get_religious_keywords()
    language_keywords = get_language_keywords()
    filtered_out_channels = []
    remaining_channels = []
    total_channels = 0
    
    try:
        # Leer archivo CSV original
        with open(input_file, 'r', encoding='utf-8', newline='') as infile:
            reader = csv.reader(infile)
            
            for row in reader:
                total_channels += 1
                
                # Verificar si la fila tiene suficientes columnas
                if len(row) >= 2:
                    channel_name = row[1]  # La columna 'name' está en el índice 1
                    
                    if is_filtered_channel(channel_name, religious_keywords, language_keywords):
                        filtered_out_channels.append(row)
                        print(f"Canal filtrado: {channel_name}")
                    else:
                        remaining_channels.append(row)
                else:
                    # Mantener filas con formato incompleto
                    remaining_channels.append(row)
        
        # Escribir archivo CSV filtrado
        with open(output_file, 'w', encoding='utf-8', newline='') as outfile:
            writer = csv.writer(outfile)
            writer.writerows(remaining_channels)
        
        return {
            'total_channels': total_channels,
            'filtered_out_channels': len(filtered_out_channels),
            'remaining_channels': len(remaining_channels),
            'filtered_channel_names': [row[1] if len(row) >= 2 else 'N/A' for row in filtered_out_channels]
        }
    
    except Exception as e:
        print(f"Error procesando archivo: {e}")
        return {'error': str(e)}

def main():
    """
    Función principal del script.
    """
    input_file = r'c:\Users\Ankel\Documents\HAZ-BUN-TV-PROD\bun-postgresql-streamio-tv\data\http.csv'
    output_file = r'c:\Users\Ankel\Documents\HAZ-BUN-TV-PROD\bun-postgresql-streamio-tv\data\http_filtered.csv'
    
    print("Iniciando filtrado de canales religiosos y en árabe/ruso...")
    print(f"Archivo de entrada: {input_file}")
    print(f"Archivo de salida: {output_file}")
    print()
    
    # Ejecutar filtrado
    stats = filter_channels(input_file, output_file)
    
    if 'error' in stats:
        print(f"Error: {stats['error']}")
        return 1
    
    # Mostrar estadísticas
    print("\n=== ESTADÍSTICAS DEL FILTRADO ===")
    print(f"Total de canales procesados: {stats['total_channels']}")
    print(f"Canales eliminados: {stats['filtered_out_channels']}")
    print(f"Canales restantes: {stats['remaining_channels']}")
    print(f"Porcentaje eliminado: {(stats['filtered_out_channels'] / stats['total_channels'] * 100):.2f}%")
    
    print("\n=== CANALES ELIMINADOS ===")
    for name in stats['filtered_channel_names']:
        print(f"- {name}")
    
    print(f"\nArchivo filtrado guardado como: {output_file}")
    print("Proceso completado exitosamente.")
    
    return 0

if __name__ == '__main__':
    exit(main())