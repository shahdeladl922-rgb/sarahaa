import nodemailer from "nodemailer";
import { randomInt } from 'node:crypto';


const sendEmail = async ({ to, subject, html, attachments } = {}) => {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: "shahdeladl922@gmail.com",
            pass: "dcasaiymvrphymdf"
        }
    })

    const info = await transporter.sendMail({
        from: '"shahd" <shahdeladl922@gmail.com>',
        to,
        subject,
        html: html || "<b>Hello world?</b>",
        attachments: attachments || []
    });
    return info.accepted.length > 0 ? true : false;
}


export const generate_otp = async ()=>{
    return randomInt(100000,1000000).toString();
}

export default sendEmail;