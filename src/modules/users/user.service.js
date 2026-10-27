import userModel from "../../DB/models/user.model.js";
import * as dbSrevice from "../../DB/service/db.service.js"
import { Decrypt, Encrypt } from "../../common/security/encrypt.js";
import { Compare, Hash } from "../../common/security/hash.js";
import { OAuth2Client } from 'google-auth-library';
import jwt from "jsonwebtoken"
import { ProviderEnum } from "../../common/enum/user.enum.js";
import { compare, compareSync, hashSync } from "bcrypt";
import { randomUUID } from 'node:crypto';
import { deleteKey, getValue, incr, keys, setValue, ttl } from "../../DB/service/redis.service.js";
import sendEmail, { generate_otp } from "../../common/service/sendEmail.js";
import { eventEmitter } from "../../common/utils/events.js";
import { confirmEmailTemplate } from "../../common/utils/emailTemplate.js";
import { sendEmailOtp } from "./user.helper.js";
const client = new OAuth2Client();

// const asyncHandler = (fn) => {
//     return (req, res, next) => {
//         fn(req, res, next).catch((error) => {
//             // res.json({ message: error.message })
//             next(error)
//         })
//     }
// }



// ============= signup ===================
export const signup = async (req, res, next) => {


    // const signUpSchema = joi.object({
    //     fName:joi.string().required(),
    //     lName:joi.string().required(),
    //     email:joi.string().required(),
    //     password:joi.string().required(),
    // }).required()

    // const {error} = signUpSchema.validate(req.body,{abortEarly:false})

    // if (error) {
    //     res.status(400).json({message:"validation error", error})
    // } 


    const { fName, lName, age, email, gender, password, phone } = req.body;

    console.log(req.files);

    const paths = [];
    for (const file of req.files.attachments) {
        paths.push(file.path)
    }


    const emailExist = await userModel.findOne({ email: email.toLowerCase() });
    if (emailExist) {
        throw new Error("email already exist");
        // return res.status(409).json({ message: "email already exist" })
        // next(new Error("email already exist"));
    };


    const otp = await generate_otp();
    const otpHash = hashSync(otp, 12);



    eventEmitter.emit("confirm_email", async () => {
        await sendEmail({
            to: email,
            subject: "Confirm Your Sarahaa Email",
            html: confirmEmailTemplate(otp)
        });
    })

    await setValue({
        key: `otp::${email}`,
        value: otpHash,
        ttl: 60 * 20
    });
    await setValue({
        key: `otp::max::${email}`,
        value: 1,
        ttl: 60 * 5
    });

    const user = await dbSrevice.create({
        model: userModel,
        data: {
            fName,
            lName,
            age,
            email,
            gender,
            password: await Hash(password),
            phone: Encrypt(phone),
            profileImage: req.files.attachment[0].path,
            coverImages: paths
        }
    });
    return res.status(201).json({ message: "Done", user })
}

// ============= reSendOtp ===================
export const reSendOtp = async (req, res, next) => {
    const { email } = req.body;
    await sendEmailOtp({ email, isConfirmed: false });
    return res.status(200).json({ message: "Done" });
}

export const confirmEmail = async (req, res, next) => {

    const { email, otp } = req.body;
    const otpValue = await getValue(`otp::${email}`)

    if (!otpValue) {
        throw new Error("otp expire", { cause: 400 });
    }
    if (!compareSync(otp, otpValue)) {
        throw new Error("inValid otp", { cause: 400 });
    }

    const user = await dbSrevice.findOneAndUpdate({
        model: userModel,
        filter: {
            email,
            isConfirmed: { $exists: false }
        },
        update: {
            isConfirmed: true
        }
    });

    if (!user) {
        throw new Error("user not exist or already exists", { cause: 400 });
    }

    await deleteKey(`otp::${email}`)
    return res.status(200).json({ message: "Done", user })
}


// ============= signupWithGmail ===================
export const signupWithGmail = async (req, res, next) => {

    const { idToken } = req.body;
    const decoded = await client.verifyIdToken({
        idToken,
        audience: "281635038487-93fefb0vpo3kia1o4m50gi0jcjhjeoab.apps.googleusercontent.com"
    });
    const { family_name, given_name, picture, email_verified, email } = decoded.getPayload();
    let user = await userModel.findOne({ email: email.toLowerCase() });

    if (!user) {
        user = await userModel.create({
            fName: given_name,
            lName: family_name,
            email,
            profileiImage: picture,
            isConfirmed: email_verified,
            provider: ProviderEnum.google
        })
    }

    if (user.provider == ProviderEnum.system) {
        throw new Error("login with system only");

    }


    const access_token = jwt.sign({ id: user._id, email: user.email }, "shahd1119", {
        expiresIn: 60 * 5
    });
    const refresh_token = jwt.sign({ id: user._id, email: user.email }, "shahd2002");


    return res.status(200).json({ message: "Done", tokens: { access_token, refresh_token } })

}

// ============= confirmEmail ===================


// ============= login ===================
export const login = async (req, res, next) => {

    const { email, password } = req.body;
    const user = await dbSrevice.findOne(
        {
            model: userModel,
            filter: {
                email: email.toLowerCase(),
                provider: ProviderEnum.system,
                isConfirmed: true
            }
        }
    );
    if (!user) {
        throw new Error("email not exist or you can signup first.");
        // return res.status(404).json({ message: "email not exist or you can signup first." })
        // next(new Error("email not exist or you can signup first."))
    }
    // if (user.isConfirmed !== true) {
    //     return res.status(404).json({ message: "email not confirmed." })
    // }
    if (!await Compare(password, user.password)) {
        throw new Error("inValid password.");
        // return res.status(404).json({ message: "inValid password." })
        // next(new Error("inValid password."))
    }
    const tokenId = randomUUID();
    const access_token = jwt.sign({ id: user._id, email: user.email }, "shahd1119", {
        expiresIn: 60 * 5,
        jwtid: tokenId
    });
    const refresh_token = jwt.sign({ id: user._id, email: user.email }, "shahd2002", {
        expiresIn: 60 * 60,
        jwtid: tokenId
    });


    return res.status(200).json({ message: "Done", tokens: { access_token, refresh_token } })
}

// ============= getProfile ===================
export const getProfile = async (req, res, next) => {

    return res.status(200).json({ message: "Done", user: req.user })
}
// ============= shareProfile ===================
export const shareProfile = async (req, res, next) => {
    const { id } = req.params;
    let user = await dbSrevice.findById({
        model: userModel,
        id,
        options: { password: 0 }
    })

    if (!user) {
        throw new Error("user not exist", { cause: 400 });
    }
    user.phone = Decrypt(user.phone)
    return res.status(200).json({ message: "Done", user })
}

// ============= refreshToken ===================
export const refreshToken = async (req, res, next) => {

    const { authorization } = req.headers;
    if (!authorization) {
        throw new Error("token not exist", { cause: 404 });
    }

    const decoded = jwt.verify(authorization, "shahd2002");
    if (!decoded?.id) {
        throw new Error("Invalid token", { cause: 404 });
    }

    const user = await dbSrevice.findOne(
        {
            model: userModel,
            filter: { email: decoded.email.toLowerCase() }
        }
    );

    if (!user) {
        throw new Error("user not exist");
    };

    const access_token = jwt.sign({ id: user._id, email: user.email }, "shahd1119", {
        expiresIn: 60 * 5
    });

    return res.status(200).json({ message: "Done", access_token })
}

// ============= updateProfile ===================
export const updateProfile = async (req, res, next) => {

    const { fName, lName, age, gender, phone } = req.body;


    let updateQuery = {};

    if (fName !== undefined) {
        updateQuery.fName = fName
    }
    if (lName !== undefined) {
        updateQuery.lName = lName
    }
    if (age !== undefined) {
        updateQuery.age = age
    }
    if (gender !== undefined) {
        updateQuery.gender = gender
    }
    if (phone !== undefined) {
        updateQuery.phone = Encrypt(phone)
    }

    let user = await dbSrevice.findByIdAndUpdate({
        model: userModel,
        id: req.user._id,
        update: updateQuery
    });

    return res.status(200).json({ message: "Done", user })
}
// ============= updatePassword ===================
export const updatePassword = async (req, res, next) => {

    const { oldPassword, newPassword } = req.body;

    if (!await compare(oldPassword, req.user.password)) {
        throw new Error("InValid Old Password");
    };

    req.user.password = await Hash(newPassword);
    req.user.changeCredintialAt = new Date();

    await req.user.save();

    return res.status(200).json({ message: "Done", user: req.user });
}
// ============= logout ===================
export const logout = async (req, res, next) => {
    const { flag } = req.query;
    if (flag && flag == "all") {
        req.user.changeCredintialAt = new Date();
        await req.user.save();
        await deleteKey(await keys(`revoke_token:"${req.user._id}`));
    } else {
        await setValue({
            key: `revoke_token:"${req.user._id}::${req.decoded.jti}`,
            value: `${req.decoded.jti}`,
            ttl: req.decoded.exp - Math.floor((Date.now() / 1000))
        })
    };

    return res.status(200).json({ message: "Done" });
}
// ============= forgetPassword ===================
export const forgetPassword = async (req, res, next) => {
    const { email } = req.body;
    await sendEmailOtp({ email, isConfirmed: true });
    return res.status(200).json({ message: "Done" });
}
// ============= resetPassword ===================
export const resetPassword = async (req, res, next) => {
    const { email, code, password } = req.body;
    const otp = await getValue(`otp::${email}`);
    if (!otp) throw new Error("otp expire");

    if (!await compare(code, otp)) throw new Error("inValid otp");

    const user = await dbSrevice.findOneAndUpdate({
        model: userModel,
        filter: {
            email,
            isConfirmed: true
        },
        update: {
            password: await Hash(password, 12),
            changeCredintialAt:new Date()
        }
    });
    if (!user) {
        throw new Error("user not exist or already exists", { cause: 400 });
    }

    await deleteKey(`otp::${email}`);

    return res.status(200).json({ message: "Done" });
}