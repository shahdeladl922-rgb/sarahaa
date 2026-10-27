
import { Multer_Enum } from "../../common/enum/multer.enum.js";
import { multerLocal } from "../../common/middleware/multer.js";
import { Router } from "express";
import * as MS from "./message.service.js"
import { validation } from "../../common/middleware/validation.js";
import { createMessageSchema } from "./message.validation.js";

const messageRouter = Router()


messageRouter.post("/",
    multerLocal({
        customPath: "messages",
        customTypes: Multer_Enum.images
    }).array("attachments", 3),
    validation(createMessageSchema),
    MS.createMessage)

export default messageRouter