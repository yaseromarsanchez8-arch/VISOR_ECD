# 🗺️ BuildPanel - Sistema de Seguimiento de Obra

## ✅ Funcionalidades Implementadas

### 1. **Google Maps Integrado**
- ✅ Mapa de Google Maps en vista satélite
- ✅ Geolocalización automática (GPS en laptop/móvil, IP en PC)
- ✅ Control de zoom, tipo de mapa, pantalla completa

### 2. **Sistema de PINs**
- ✅ Crear PINs haciendo click en el mapa
- ✅ Cada PIN almacena:
  - Nombre (configurable)
  - Coordenadas GPS (lat, lng)
  - Fecha de creación
  - Lista de documentos asociados
- ✅ PINs persistentes (guardados en localStorage)
- ✅ Seleccionar PIN para ver detalles
- ✅ Eliminar PINs con confirmación

### 3. **Asociación de Documentos**
- ✅ Subir documentos/fotos a ACC (funcionalidad existente preservada)
- ✅ Asociar documentos existentes a un PIN
- ✅ Ver lista de documentos por PIN
- ✅ Cada documento guarda fecha de asociación
- ✅ Acciones rápidas desde PIN:
  - Ver documento en nueva ventana
  - Abrir en visor APS
  - Eliminar asociación

### 4. **Filtros por Fecha**
- ✅ Filtrar PINs por fecha de creación
- ✅ Filtrar documentos asociados por fecha
- ✅ Selector de fecha con borrado rápido

### 5. **Vistas Alternativas**
- ✅ **Vista Mapa**: Interactiva con PINs visuales
- ✅ **Vista Lista**: Cards con resumen de cada punto
- ✅ Toggle rápido entre vistas

---

## 🚀 Configuración

### **Paso 1: Obtener Google Maps API Key**

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Habilita la API "Maps JavaScript API"
4. Crea credenciales → API Key
5. (Opcional) Restringe la API key a tu dominio

### **Paso 2: Configurar la API Key**

Abre el archivo `frontend-react/index.html` y reemplaza `YOUR_GOOGLE_MAPS_API_KEY` con tu key:

```html
<script>
  window.__GOOGLE_MAPS_API_KEY = 'TU_API_KEY_AQUI';
</script>
```

**O** configura una variable de entorno:

```bash
# En .env
VITE_GOOGLE_MAPS_API_KEY=TU_API_KEY_AQUI
```

---

## 📖 Cómo Usar

### **Crear un Punto de Inspección**

1. Abre el panel **Build** (icono de construcción en la barra lateral)
2. Cambia a **vista Mapa** (botón 🗺️ Mapa)
3. Haz **click en cualquier lugar del mapa**
4. Se creará un PIN automáticamente

### **Subir y Asociar Documentos**

1. Haz click en el botón **📤 Cargar Documentos**
2. Selecciona fotos/archivos desde tu computadora
3. Los archivos se subirán a ACC automáticamente
4. Selecciona un PIN en el mapa
5. En el panel lateral, usa el selector "Asociar documento existente"
6. Elige el documento que quieres asociar al punto

### **Filtrar por Fecha**

1. Usa el selector **📅 Filtrar por fecha**
2. Selecciona cualquier fecha
3. Solo se mostrarán:
   - PINs creados ese día
   - PINs con documentos subidos ese día
4. Haz click en **✕** para limpiar el filtro

### **Ver Documentos de un PIN**

1. Haz click en cualquier PIN del mapa
2. Se abrirá un panel lateral con:
   - Coordenadas GPS
   - Fecha de creación
   - Lista de documentos asociados
3. Opciones por documento:
   - **Ver**: Abre el archivo en nueva pestaña
   - **Visor**: Carga modelos 3D en el visor APS
   - **✕**: Elimina la asociación (no borra el archivo)

---

## 🗂️ Estructura de Datos

### **PIN**
```javascript
{
  id: "pin-1732108827123",
  name: "Punto 1",
  position: {
    lat: -12.0464,
    lng: -77.0428
  },
  createdAt: "2025-11-20T13:30:00.000Z",
  documents: [
    {
      id: "build-foto_columna.jpg-1732108900000",
      name: "foto_columna.jpg",
      uploadedAt: "2025-11-20T13:35:00.000Z",
      url: "https://...",
      storageId: "urn:adsk.objects:os.object:...",
      type: "image/jpeg",
      urn: "dXJuOmFkc2...",
      size: 2048000
    }
  ]
}
```

### **Persistencia**
- Los PINs se guardan automáticamente en `localStorage`
- Clave: `buildPins`
- Los documentos se almacenan en ACC (servidor)

---

## 🎨 Características de UI

### **Marcadores en el Mapa**
- 🔵 **Azul**: Tu ubicación actual
- 🟢 **Verde**: PINs normales
- 🟠 **Naranja**: PIN seleccionado
- Numerados del 1 al N

### **Colores y Estados**
- **Header verde**: Panel de detalles de PIN activo
- **Hover effects**: Todos los elementos interactivos
- **Animaciones suaves**: Transiciones y efectos visuales

---

## 🔧 Solución de Problemas

### **El mapa no carga**
1. Verifica que la API key esté configurada correctamente
2. Abre la consola del navegador (F12) y busca errores
3. Asegúrate de que "Maps JavaScript API" esté habilitada en Google Cloud

### **Geolocalización no funciona**
1. Permite el acceso a ubicación cuando el navegador lo solicite
2. Si estás en HTTPS, la geolocalización funciona mejor
3. Fallback: Si falla, se usa Lima, Perú como centro por defecto

### **Los PINs no se guardan**
1. Los PINs se guardan automáticamente en localStorage
2. NO se borran al refrescar la página
3. Se borran si limpias el cache del navegador
4. Considera agregar sincronización con backend en el futuro

---

## 📊 Datos Técnicos

### **Archivos Creados**
- `frontend-react/src/components/BuildPanel.jsx` - Componente principal
- `frontend-react/src/components/BuildPanel.css` - Estilos

### **Archivos Modificados**
- `frontend-react/src/App.jsx` - Integración del componente
- `frontend-react/index.html` - Configuración de Google Maps API

### **Funcionalidades Preservadas**
- ✅ Carga de archivos a ACC (`/api/build/acc-upload`)
- ✅ Consulta de documentos desde ACC
- ✅ Generación de URLs firmadas
- ✅ Traducción con Model Derivative
- ✅ Visualización en visor APS

---

## 🚀 Próximas Mejoras (Opcionales)

1. **Backend para PINs**
   - Endpoint `/api/build/pins` para persistir en base de datos
   - Sincronización entre dispositivos

2. **Edición de PINs**
   - Renombrar puntos
   - Arrastrar y mover PINs en el mapa
   - Agregar notas/comentarios

3. **Galería de Fotos**
   - Vista de galería para documentos de tipo imagen
   - Lightbox para visualización ampliada

4. **Exportar Reporte**
   - Generar PDF con mapa y fotos
   - Exportar a Excel/CSV

5. **Colaboración**
   - Compartir PINs con otros usuarios
   - Comentarios en documentos

---

## 📞 Soporte

Si tienes problemas o preguntas:
1. Revisa la consola del navegador (F12)
2. Verifica que todos los servicios estén corriendo:
   - Backend: `python server.py` (puerto 3000)
   - Frontend: `npm run dev` (puerto 5173)
3. Asegúrate de tener tokens válidos de Autodesk

---

**Desarrollado con ❤️ para seguimiento de obra en construcción**
