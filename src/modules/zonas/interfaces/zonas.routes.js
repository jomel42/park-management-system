import { Router }
from 'express';

import { ZonasRepository }
from '../infrastructure/zonas.repository.js';

const router = Router();

/*
GET ZONAS
*/

router.get('/', async(req,res)=>{

    try{

        const zonas =
        await ZonasRepository.getAll();

        res.json(zonas);

    }catch(error){

        console.log(error);

        res.status(500).json({

            error:
            'Error cargando zonas'
        });
    }
});

export default router;