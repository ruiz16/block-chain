import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// --- Helper to parse .env.local ---
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: No se encontró el archivo .env.local. Asegúrate de estar en la raíz del proyecto.');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const parts = trimmed.split('=');
      const key = parts[0]?.trim();
      const value = parts.slice(1).join('=').trim();
      if (key && value) {
        env[key] = value.replace(/(^["']|["']$)/g, ''); // Remove quotes
      }
    }
  });

  return env;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_KEY no están definidos en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const USERS_TO_SEED = [
  {
    email: 'admin@blockchain.com',
    password: 'Blockchain2026!',
    nombre: 'Administrador Sistema',
    rol: 'admin',
    wallet_address: '0x1111111111111111111111111111111111111111',
  },
  {
    email: 'test@blockchain.com',
    password: 'Blockchain2026!',
    nombre: 'Pedro Usuario',
    rol: 'usuario',
    wallet_address: '0x3333333333333333333333333333333333333333',
  },
];

async function seed() {
  console.log('Iniciando el sembrado de usuarios...');

  // 1. Obtener la lista de usuarios existentes en Auth para evitar duplicados
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('Error al listar usuarios de Auth:', listError.message);
    process.exit(1);
  }

  const existingUsersByEmail = new Map(users.map(u => [u.email?.toLowerCase(), u]));

  for (const seedUser of USERS_TO_SEED) {
    let authUser = existingUsersByEmail.get(seedUser.email.toLowerCase());

    if (!authUser) {
      console.log(`Creando usuario Auth para ${seedUser.email}...`);
      const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email: seedUser.email,
        password: seedUser.password,
        email_confirm: true,
      });

      if (createError) {
        console.error(`Error al crear usuario ${seedUser.email}:`, createError.message);
        continue;
      }
      authUser = createData.user;
      console.log(`Usuario Auth creado con ID: ${authUser.id}`);
    } else {
      console.log(`El usuario Auth para ${seedUser.email} ya existe con ID: ${authUser.id}`);
    }

    // 2. Verificar o insertar el perfil en la tabla participantes
    const { data: existingParticipante, error: selectError } = await supabase
      .from('participantes')
      .select('id, rol')
      .eq('user_id', authUser.id)
      .maybeSingle();

    if (selectError) {
      console.error(`Error al buscar participante para ${seedUser.email}:`, selectError.message);
      continue;
    }

    if (!existingParticipante) {
      console.log(`Insertando participante para ${seedUser.nombre} (${seedUser.rol})...`);
      const { error: insertError } = await supabase
        .from('participantes')
        .insert({
          user_id: authUser.id,
          nombre: seedUser.nombre,
          rol: seedUser.rol,
          wallet_address: seedUser.wallet_address,
          activo: true,
          score_reputacion: 50,
          auth_password: seedUser.password, // guardamos el password generado para el flujo de SIWE si aplica
        });

      if (insertError) {
        console.error(`Error al insertar participante para ${seedUser.email}:`, insertError.message);
      } else {
        console.log(`Participante insertado exitosamente para ${seedUser.nombre}.`);
      }
    } else {
      console.log(`El participante para ${seedUser.email} ya existe. Validando rol...`);
      if (existingParticipante.rol !== seedUser.rol) {
        console.log(`Actualizando rol de ${existingParticipante.rol} a ${seedUser.rol}...`);
        const { error: updateError } = await supabase
          .from('participantes')
          .update({ rol: seedUser.rol })
          .eq('id', existingParticipante.id);

        if (updateError) {
          console.error(`Error al actualizar rol del participante:`, updateError.message);
        } else {
          console.log(`Rol actualizado exitosamente.`);
        }
      } else {
        console.log(`El rol es correcto (${existingParticipante.rol}).`);
      }
    }
  }

  console.log('Sembrado de usuarios completado.');
}

seed().catch((err) => {
  console.error('Error inesperado en el script de seed:', err);
});
