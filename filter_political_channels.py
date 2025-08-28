#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para filtrar canales políticos de un archivo CSV
Filtra canales relacionados con congresos, parlamentos, instituciones públicas y gobierno
"""

import csv
import os
import shutil
from datetime import datetime

def get_political_keywords():
    """Retorna lista de palabras clave para identificar canales políticos"""
    return [
        # Instituciones legislativas
        'congreso', 'congress', 'parliament', 'parlamento', 'diputados', 'senado', 'senate',
        'asamblea', 'assembly', 'cámara', 'chamber', 'legislativo', 'legislative',
        
        # Instituciones gubernamentales
        'gobierno', 'government', 'ministerio', 'ministry', 'presidencia', 'presidency',
        'municipal', 'ayuntamiento', 'alcaldía', 'city hall', 'town hall',
        'federal', 'estatal', 'state', 'provincial', 'regional',
        
        # Canales específicos identificados
        'controversia tv', 'marin tv government', 'parliament of guyana',
        
        # Términos políticos generales
        'político', 'political', 'política', 'politics', 'gubernamental',
        'institucional', 'institutional', 'oficial', 'official'
    ]

def is_political_channel(name, url):
    """Determina si un canal es político basándose en su nombre y URL"""
    if not name:
        return False
    
    name_lower = name.lower()
    url_lower = url.lower() if url else ''
    
    political_keywords = get_political_keywords()
    
    # Verificar palabras clave en el nombre del canal
    for keyword in political_keywords:
        if keyword in name_lower or keyword in url_lower:
            return True
    
    return False

def filter_political_channels(input_file, output_file, backup_file=None):
    """Filtra canales políticos del archivo CSV"""
    
    if not os.path.exists(input_file):
        print(f"Error: El archivo {input_file} no existe")
        return False
    
    # Crear backup si se especifica
    if backup_file:
        try:
            shutil.copy2(input_file, backup_file)
            print(f"Backup creado: {backup_file}")
        except Exception as e:
            print(f"Error creando backup: {e}")
            return False
    
    political_channels = []
    filtered_channels = []
    
    try:
        # Leer archivo original
        with open(input_file, 'r', encoding='utf-8', newline='') as infile:
            reader = csv.reader(infile)
            header = next(reader)  # Leer encabezado
            
            for row in reader:
                if len(row) >= 2:  # Asegurar que hay al menos id y name
                    channel_id = row[0]
                    channel_name = row[1]
                    channel_url = row[2] if len(row) > 2 else ''
                    
                    if is_political_channel(channel_name, channel_url):
                        political_channels.append({
                            'id': channel_id,
                            'name': channel_name,
                            'url': channel_url
                        })
                        print(f"Canal político identificado: {channel_name}")
                    else:
                        filtered_channels.append(row)
        
        # Escribir archivo filtrado
        with open(output_file, 'w', encoding='utf-8', newline='') as outfile:
            writer = csv.writer(outfile)
            writer.writerow(header)  # Escribir encabezado
            writer.writerows(filtered_channels)
        
        # Mostrar estadísticas
        total_channels = len(political_channels) + len(filtered_channels)
        print(f"\n=== Estadísticas de Filtrado Político ===")
        print(f"Total de canales procesados: {total_channels}")
        print(f"Canales políticos filtrados: {len(political_channels)}")
        print(f"Canales restantes: {len(filtered_channels)}")
        
        if political_channels:
            print(f"\n=== Canales Políticos Eliminados ===")
            for channel in political_channels:
                print(f"- {channel['name']} (ID: {channel['id']})")
        
        print(f"\nArchivo filtrado guardado como: {output_file}")
        return True
        
    except Exception as e:
        print(f"Error procesando archivo: {e}")
        return False

def main():
    """Función principal"""
    # Configuración de archivos
    base_dir = "data"
    input_file = os.path.join(base_dir, "http.csv")
    output_file = os.path.join(base_dir, "http_filtered_political.csv")
    backup_file = os.path.join(base_dir, "http_backup_political.csv")
    
    print("=== Filtro de Canales Políticos ===")
    print(f"Archivo de entrada: {input_file}")
    print(f"Archivo de salida: {output_file}")
    print(f"Archivo de backup: {backup_file}")
    print(f"Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Ejecutar filtrado
    success = filter_political_channels(input_file, output_file, backup_file)
    
    if success:
        print("\n✅ Filtrado de canales políticos completado exitosamente")
    else:
        print("\n❌ Error durante el filtrado de canales políticos")

if __name__ == "__main__":
    main()