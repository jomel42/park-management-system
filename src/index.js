import dotenv from 'dotenv';

import app from './core/server.js';

import { pool } from './config/db.js';
import http from 'http';
import { attachRealtime } from './core/realtime.js';

dotenv.config();

const PORT =
process.env.PORT || 300;

/*
INICIAR SERVIDOR
*/

async function startServer(){

    try{

        /*
        PROBAR MYSQL
        */

        const connection =
        await pool.getConnection();

        console.log(
            'MySQL conectado correctamente'
        );

        connection.release();

        /*
        LEVANTAR EXPRESS
        */

        const server = http.createServer(app);
        await attachRealtime(server);

        server.listen(PORT, ()=>{

            console.log(
                `Servidor corriendo en puerto ${PORT}`
            );
        });

    }catch(error){

        console.log(
            'Error MySQL:',
            error
        );
    }
}

startServer();
