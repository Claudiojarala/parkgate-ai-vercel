# ParkGate AI · Smart Parking USIL

MVP de control de acceso vehicular con Next.js App Router, MongoDB Atlas, Gemini 2.5 Flash y MQTT sobre HiveMQ. El PIN y los servicios de backend se validan únicamente en el servidor; la cookie de sesión es `httpOnly`, `secure` en producción y tiene una vigencia de 8 horas.

## Variables de entorno

Configura en Vercel (Development/Preview/Production según corresponda):

- `OPERATOR_PIN`: PIN privado del operador.
- `GEMINI_API_KEY`: API key de Google AI Studio para Gemini 2.5 Flash.
- `MONGODB_URI`: cadena de conexión de MongoDB Atlas.
- `NEXT_PUBLIC_MANUAL_URL` (opcional): URL del manual de operación IoT.

Si falta cualquiera de las tres variables requeridas, la aplicación indica **Modo demostración**, usa el padrón simulado de `data/vehicles.ts` y no publica comandos físicos. En demo, el PIN es `1234`.

## MongoDB Atlas

Base `smart_parking_db`. Atlas debe permitir conexiones desde Vercel en **Network Access**.

- `placas_autorizadas`: `{ placa, propietario, activo, espacio_asignado: 1 | 2 | null, dentro: boolean, actualizado_utc }`. Los documentos antiguos sin `espacio_asignado` ni `dentro` se leen como `null` y `false`.
- `eventos_parking`: `{ evento, placa, detalle, origen, alerta?, resuelta?, fecha_utc }`. Eventos nuevos: `ALERTA_CLONACION`, `ALERTA_OCUPACION_INDEBIDA`, `ESTACIONAMIENTO_CORRECTO`, `PLAZA_OCUPADA`, `PLAZA_LIBRE`, `SALIDA_VEHICULO`, `CONTROL_MANUAL`, `RESET_SISTEMA`.
- `plazas_estado` (nueva): `{ espacio: 1 | 2, ocupada, placa, validacion: SIN_VALIDAR | CORRECTA | INDEBIDA, actualizado_utc }`.

## Flujos

**Ingreso (`/api/lpr`)**: A) placa activa y fuera → `ABRIR_ENTRADA` y `dentro = true` (solo si el comando se publicó). B) placa activa que ya figura dentro → `ALERTA_CLONACION`, barrera cerrada, alerta en el panel. C) placa no registrada → `PLACA_NO_REGISTRADA`, barrera cerrada.

**Plazas (`/api/spaces`, `/api/audit-scan`)**: el panel escucha los sensores por MQTT y guarda los cambios en `plazas_estado`. Al liberarse una plaza se libera el estado `dentro` del vehículo vinculado. El segundo escáner (pestaña Plazas) compara la placa leída con el titular del espacio: coincide → `ESTACIONAMIENTO_CORRECTO`; no coincide → `ALERTA_OCUPACION_INDEBIDA`.

**Control manual (`/api/control`, `/api/reset`)**: servos, 4 LEDs, texto del LCD y reinicios (alertas, ocupación o sistema completo).

## Contrato MQTT con el ESP32

Telemetría (`usil/iot/parking/p01/estado`, JSON): `{ libres, ocupados, cap, barrera_entrada, barrera_salida, espacio1, espacio2 }` con `espacio1` y `espacio2` en `"LIBRE"` u `"OCUPADO"`. Disponibilidad: `usil/iot/parking/p01/disponibilidad` = `online` / `offline`.

Comandos (`usil/iot/parking/p01/cmd`, texto), que el firmware debe implementar:

| Payload | Acción en la maqueta |
| --- | --- |
| `ABRIR_ENTRADA`, `CERRAR_ENTRADA`, `ABRIR_SALIDA`, `CERRAR_SALIDA` | Servo + LED rojo; al cerrar la entrada, actualiza el contador y el LCD |
| `ALERTA_CLONACION` | Barrera cerrada; LCD con alerta de posible falsificación hasta `LCD:NORMAL` |
| `PLACA_NO_REGISTRADA` | Barrera cerrada; LCD "Placa no registrada" unos segundos y vuelve al normal |
| `LED:<ROJO_ENTRADA\|ROJO_SALIDA\|VERDE_E1\|VERDE_E2>:<ON\|OFF>` | Enciende o apaga ese LED |
| `LCD:<línea1>\|<línea2>` | Muestra el texto (16 caracteres por línea, ASCII en mayúsculas) |
| `LCD:NORMAL` | Restaura "SMART PARKING USIL" y "Libres: n/5" |
| `RESET` | Contador a valor base, barreras cerradas, LCD y LEDs de estado base |

## Límites conocidos

- Vercel no mantiene una suscripción MQTT permanente: la ocupación de plazas se guarda mientras haya un panel abierto. Para no depender de eso, el ESP32 puede hacer un POST HTTP a `/api/spaces` o se puede usar un worker aparte.
- La salida no tiene lectura de placa. El estado `dentro` se libera cuando se vacía la plaza vinculada; para vehículos sin plaza física hay un botón **Marcar salida** en el padrón.
- El broker público de HiveMQ no tiene autenticación: antes de un uso real, pasa a HiveMQ Cloud con usuario y contraseña.

## MQTT

El navegador solo se suscribe por `wss://broker.hivemq.com:8884/mqtt` a los tópicos de telemetría existentes. Los comandos de barrera se publican únicamente desde Route Handlers del servidor en `usil/iot/parking/p01/cmd`.
