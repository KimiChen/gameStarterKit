import fs from 'fs'
import multer from 'multer'

export const adjustConfigUploadStorage = multer.diskStorage({
    destination: function (req, file, callback) {
        const uploadPath = 'public/uploadCfg'
        if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true })
        callback(null, uploadPath)
    },
    filename: function (req, file, callback) {
        callback(null, file.originalname)
    },
})
