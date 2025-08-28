#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para filtrar canales de Pluto TV del archivo CSV
"""

import csv
import os
import shutil
from datetime import datetime

def get_pluto_keywords():
    """Retorna lista de palabras clave para identificar canales de Pluto TV"""
    return [
        'pluto tv',
        'pluto.tv',
        'plutotv',
        'service-stitcher.clusters.pluto.tv',
        'cfd-v4-service-channel-stitcher-use1-1.prd.pluto.tv'
    ]

def is_pluto_channel(channel_name, channel_url):
    """Verifica si un canal es de Pluto TV"""
    pluto_keywords = get_pluto_keywords()
    
    # Convertir a minúsculas para comparación insensible a mayúsculas
    channel_name_lower = channel_name.lower()
    channel_url_lower = channel_url.lower()
    
    # Verificar si alguna palabra clave está en el nombre o URL del canal
    for keyword in pluto_keywords:
        if keyword in channel_name_lower or keyword in channel_url_lower:
            return True
    
    return False

def filter_pluto_channels(input_file, output_file):
    """Filtra canales de Pluto TV del archivo CSV"""
    pluto_channels = []
    filtered_channels = []
    
    try:
        with open(input_file, 'r', encoding='utf-8') as infile:
            reader = csv.reader(infile)
            
            for row in reader:
                if len(row) >= 3:  # Asegurar que hay al menos ID, nombre y URL
                    channel_id = row[0]
                    channel_name = row[1]
                    channel_url = row[2]
                    
                    if is_pluto_channel(channel_name, channel_url):
                        pluto_channels.append({
                            'id': channel_id,
                            'name': channel_name,
                            'url': channel_url
                        })
                    else:
                        filtered_channels.append(row)
                else:
                    # Mantener filas con formato incompleto
                    filtered_channels.append(row)
        
        # Escribir canales filtrados al archivo de salida
        with open(output_file, 'w', encoding='utf-8', newline='') as outfile:
            writer = csv.writer(outfile)
            writer.writerows(filtered_channels)
        
        return pluto_channels, len(filtered_channels)
    
    except Exception as e:
        print(f"Error procesando archivo: {e}")
        return [], 0

def main():
    """Función principal"""
    input_file = 'data/http.csv'
    output_file = 'data/http_filtered_pluto.csv'
    backup_file = 'data/http_backup_pluto.csv'
    
    # Verificar que el archivo de entrada existe
    if not os.path.exists(input_file):
        print(f"Error: El archivo {input_file} no existe.")
        return
    
    # Crear respaldo del archivo original
    try:
        shutil.copy2(input_file, backup_file)
        print(f"Respaldo creado: {backup_file}")
    except Exception as e:
        print(f"Error creando respaldo: {e}")
        return
    
    # Contar canales originales
    with open(input_file, 'r', encoding='utf-8') as f:
        original_count = sum(1 for line in f)
    
    print(f"Procesando {original_count} canales...")
    
    # Filtrar canales de Pluto TV
    pluto_channels, remaining_count = filter_pluto_channels(input_file, output_file)
    
    # Mostrar estadísticas
    print(f"\n=== ESTADÍSTICAS DE FILTRADO ===")
    print(f"Canales originales: {original_count}")
    print(f"Canales de Pluto TV eliminados: {len(pluto_channels)}")
    print(f"Canales restantes: {remaining_count}")
    
    if pluto_channels:
        print(f"\n=== CANALES DE PLUTO TV ELIMINADOS ===")
        for i, channel in enumerate(pluto_channels, 1):
            print(f"{i}. {channel['name']}")
    
    print(f"\nArchivo filtrado guardado como: {output_file}")
    print(f"Respaldo del archivo original: {backup_file}")
    print(f"Proceso completado: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == "__main__":
    main()