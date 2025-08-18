import { asyncHandler } from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import { Student } from "../models/studentModel.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import nodemailer from "nodemailer";
import session from "express-session";
import axios from "axios";


const transporter = nodemailer.createTransport({
    service: 'gmail', 
    secure: false,
    port: 587,   //Gmail generally operates on it.
    auth: {
        user: process.env.EMAIL,  // Email address through which email is sent (e.g., your email@gmail.com)
        pass: process.env.PASSWORD,
    },
});

function generateOtp() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";

  const randomLetter = () =>
    letters.charAt(Math.floor(Math.random() * letters.length));
  const randomNumber = () =>
    numbers.charAt(Math.floor(Math.random() * numbers.length));

  // 2 letters + 2 numbers
  let otp = randomLetter() + randomLetter() + randomNumber() + randomNumber();

  return otp;
}
                async function sendOtp(email, otp) {
                    const mailOptions = {
                        from: process.env.EMAIL, 
                        to: email,                
                        subject: 'Your OTP for Registration for The Turing Test-25', 
                        text: `Your OTP is: ${otp}. It will expire in 3 minutes.\n\nRegards,\nMLCOE\nOwner` 
                    };

                    try {
                        await transporter.sendMail(mailOptions);
                        console.log(`OTP sent to email: ${email}`);
                        return true; 
                    } catch (error) {
                        console.error('Error sending OTP email:', error);
                        return false;
                    }
                }


const registerStudent = asyncHandler(async (req, res) => {
    const { fullName, studentNumber, gender, rollNumber, mobileNumber, studentEmail, branch, scholar, domain } = req.body;
    const userIp = req.headers['x-forwarded-for'] || req.ip;

    const registrationCount = await Student.countDocuments({ ip: userIp });
    if (registrationCount >= 2) {
        throw new ApiError(400, "Registration limit reached for this device.");
    }

    if (!studentEmail.endsWith('@akgec.ac.in')) {
        throw new ApiError(400, "Must Enter College Email Id Only");
    }

    if (!(studentNumber.startsWith('23') || studentNumber.startsWith('24'))) {
        throw new ApiError(401, "Unauthorized student Number");
    }

    const emailExist = await Student.findOne({ studentEmail });
    const numberExist = await Student.findOne({ mobileNumber });
    const stNumExist= await Student.findOne({studentNumber});
    const studentExist = emailExist || numberExist || stNumExist;

    if (mobileNumber.length !== 10 || isNaN(Number(mobileNumber))) {
        throw new ApiError(400, "Mobile Number is invalid");
    }

    if (studentExist) {
        throw new ApiError(401, "Already registered email");
    }

    // Generate OTP
    const otp = generateOtp();
    const otpExpiry = Date.now() + 3 * 60 * 1000; // 3 minutes

    // Store OTP in session
    req.session.otp = otp;
    req.session.otpExpiry = otpExpiry;
    req.session.userData = {
        fullName, studentNumber, gender, mobileNumber, studentEmail,
        branch, scholar, ip: userIp, otpExpiry, rollNumber, domain
    };

    const otpSent = await sendOtp(studentEmail, otp);
    if (!otpSent) {
        throw new ApiError(500, "Failed to send OTP. Please try again.");
    }

    res.status(200).json(new ApiResponse(200, { studentEmail }, "OTP sent successfully. Please verify your email."));
});

const verifyStudentRegistration = asyncHandler(async (req, res) => {
    const { otp } = req.body;

    // Validate OTP
    if (!req.session.otp) {
        throw new ApiError(400, "OTP not found in session. Please restart registration.");
    }

    if (String(otp) !== String(req.session.otp)) {
        throw new ApiError(401, "Invalid OTP");
    }

    if (req.session.otpExpiry < Date.now()) {
        req.session.otp = null;
        req.session.otpExpiry = null;
        req.session.userData = null;
        throw new ApiError(400, "OTP expired. Please restart registration.");
    }

    const newStudent = await Student.create(req.session.userData);

    if (!newStudent) {
        throw new ApiError(500, "Failed to create student. Please try again.");
    }

    // Clear session after successful registration
    req.session.otp = null;
    req.session.otpExpiry = null;
    req.session.userData = null;

    res.status(201).json(
        new ApiResponse(201, { student: newStudent }, "Student registered and verified successfully.")
    );
});


const verifyCaptcha = async (req, res) => {
    const { recaptchaValue } = req.body;

    if (!recaptchaValue) {
        return res.status(400).json({ message: 'reCAPTCHA value is missing' });
    }

    try {
        const { data } = await axios.post(
            'https://www.google.com/recaptcha/api/siteverify',
            null,
            {
                params: {
                    secret: process.env.RECAPTCHA_SECRET_KEY,
                    response: recaptchaValue,
                },
            }
        );

        if (data.success) {
            return res.status(200).json({ message: 'reCAPTCHA verified successfully' });
        } else {
            return res.status(400).json({ message: 'reCAPTCHA verification failed' });
        }
    } catch (error) {
        console.error('reCAPTCHA error:', error);
        return res.status(500).json({ message: 'reCAPTCHA verification error' });
    }
};

const resendOTP = asyncHandler(async (req, res) => {
    if (!req.session.userData) {
        throw new ApiError(400, "User data not found in session. Please start registration again.");
    }

    const { studentEmail } = req.session.userData;
    const newOtp = generateOtp();

    const otpExpiry = Date.now() + 3 * 60 * 1000; // 3 minutes
    req.session.otp = newOtp;
    req.session.otpExpiry = otpExpiry;
    req.session.userData.otpExpiry = otpExpiry; // update otpExpiry

    const otpSent = await sendOtp(studentEmail, newOtp);
    if (!otpSent) {
        throw new ApiError(500, "Failed to send OTP. Please try again.");
    }

    res.status(200).json(new ApiResponse(200, { studentEmail }, "OTP resent successfully."));
});


export { registerStudent, verifyStudentRegistration,verifyCaptcha,resendOTP };
