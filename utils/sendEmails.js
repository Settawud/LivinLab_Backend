import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // Your Gmail address from .env
    pass: process.env.EMAIL_PASS,   // Your Gmail App Password from .env
  },
});

const sendEmail = async (to, subject, html) => {
  try {
    console.log("Attempting to send email to:", to, "with subject:", subject);
    await transporter.sendMail({
      from: `"Ergo-Life" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: subject,
      html: html,
    });
    console.log("Email sent successfully to", to);
  } catch (error) {
    console.error("Error sending email:", error);
    // Don't throw error to prevent server crash
  }
};

export const sendVerificationEmail = async (to, token) => {
  const subject = "Verify your email address";
  // Make sure your frontend URL is in the .env file
  const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  const html = `
    <h1>Please verify your email address</h1>
    <p>Click the link below to verify your email address:</p>
    <a href="${verificationLink}">${verificationLink}</a>
  `;
  await sendEmail(to, subject, html);
};

export const sendPasswordResetEmail = async (to, token) => {
  const subject = "Reset your password";
  // Make sure your frontend URL is in the .env file
  const resetLink = `${process.env.FRONTEND_URL}/reset?token=${token}`;
  const html = `
    <h1>You have requested to reset your password</h1>
    <p>Click the link below to reset your password:</p>
    <a href="${resetLink}">${resetLink}</a>
  `;
  await sendEmail(to, subject, html);
};

export const sendOrderConfirmationEmail = async (to, order) => {
    const subject = `Order Confirmation #${order.orderNumber}`;
    // Make sure your frontend URL is in the .env file
    const orderLink = `${process.env.FRONTEND_URL}/order-confirm/${order._id}`;
    const html = `
      <h1>Thank you for your order!</h1>
      <p>Hi there,</p>
      <p>Your order #${order.orderNumber} has been confirmed.</p>
      <h2>Order Details</h2>
      <ul>
        ${order.items.map(item => `<li>${item.productName} (x${item.variant.quantity}) - ${item.variant.price} THB</li>`).join('')}
      </ul>
      <p><strong>Subtotal:</strong> ${order.subtotalAmount} THB</p>
      <p><strong>Discount:</strong> ${order.discountAmount || 0} THB</p>
      <p><strong>Installation Fee:</strong> ${order.installationFee || 0} THB</p>
      <h3>Total: ${order.items.reduce((sum, item) => sum + item.variant.price * item.variant.quantity, 0) - (order.discountAmount || 0) + (order.installationFee || 0)} THB</h3>
      <p>You can view your order details here: <a href="${orderLink}">View Order</a></p>
      <p>We will notify you again once your order has shipped.</p>
    `;
    await sendEmail(to, subject, html);
};

export default sendEmail;
