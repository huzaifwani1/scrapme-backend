const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const PickupPartner = require('../models/PickupPartner');
const PickupOrder = require('../models/PickupOrder');
const PickupLocation = require('../models/PickupLocation');
const PickupTimeline = require('../models/PickupTimeline');
const Request = require('../models/Request');
const crypto = require('crypto');
const smsService = require('../utils/smsService');
const emailService = require('../utils/emailService');
const mongoose = require('mongoose');
const eventBus = require('../utils/eventBus');
const fetch = require('node-fetch').default || global.fetch || require('node-fetch');

// Haversine distance helper (returns meters)
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Background reverse geocoding with movement filtering to stay under Nominatim limits
const updateReverseGeocode = async (loc, latNum, lngNum) => {
  try {
    if (loc.address && loc.lastGeocodedLat !== undefined && loc.lastGeocodedLng !== undefined) {
      const dist = getDistanceMeters(loc.lastGeocodedLat, loc.lastGeocodedLng, latNum, lngNum);
      if (dist < 50) {
        return; // Throttled: moved less than 50 meters
      }
    }
    
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latNum}&lon=${lngNum}&format=json`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ScrapMe-Logistics-Platform/1.0'
      }
    });
    if (response.ok) {
      const data = await response.json();
      if (data && data.display_name) {
        loc.address = data.display_name;
        loc.lastGeocodedLat = latNum;
        loc.lastGeocodedLng = lngNum;
        await loc.save();
        
        eventBus.sendEvent('gps_address_update', {
          partnerId: loc.partnerId,
          address: data.display_name
        });
      }
    }
  } catch (err) {
    console.error('[GEOPROCESSOR ERROR] Reverse geocoding failed:', err.message);
  }
};

/* ─── PARTNER / WAREHOUSE AUTH ────────────────────── */
const partnerLogin = async (req, res, next) => {
  try {
    const { employeeId, password } = req.body;
    if (!employeeId || !password) {
      return res.status(400).json({ message: 'Employee ID and password are required' });
    }

    const partner = await PickupPartner.findOne({ employeeId: employeeId.toUpperCase() });
    if (!partner) {
      return res.status(401).json({ message: 'Invalid employee credentials' });
    }

    if (!partner.active) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    const isMatch = await bcrypt.compare(password, partner.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid employee credentials' });
    }

    const token = jwt.sign(
      { id: partner._id, employeeId: partner.employeeId, role: partner.role, name: partner.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set online status to true on login if role is partner
    if (partner.role === 'partner') {
      partner.online = true;
      partner.lastActive = new Date();
      await partner.save();

      await PickupTimeline.create({
        partnerId: partner._id,
        eventName: 'logged_in',
        details: `${partner.name} logged in.`
      });
    }

    res.json({
      token,
      user: {
        id: partner._id,
        name: partner.name,
        phone: partner.phone,
        employeeId: partner.employeeId,
        role: partner.role
      }
    });
  } catch (err) {
    next(err);
  }
};

const partnerLogout = async (req, res, next) => {
  try {
    const partner = await PickupPartner.findByIdAndUpdate(
      req.user.id,
      { online: false, lastActive: new Date() },
      { new: true }
    ).select('-password');

    await PickupTimeline.create({
      partnerId: partner._id,
      eventName: 'logged_out',
      details: `${partner.name} logged out.`
    });

    eventBus.sendEvent('partner_status_change', {
      partnerId: partner._id,
      name: partner.name,
      online: false,
      lastActive: partner.lastActive,
      employeeId: partner.employeeId,
      role: partner.role
    });

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

const getMe = async (req, res, next) => {
  try {
    const partner = await PickupPartner.findById(req.user.id).select('-password');
    if (!partner) return res.status(404).json({ message: 'Partner profile not found' });
    res.json(partner);
  } catch (err) {
    next(err);
  }
};

/* ─── PICKUP PARTNER ORDERS ───────────────────────── */
const getAssignedOrders = async (req, res, next) => {
  try {
    const partner = await PickupPartner.findById(req.user.id);
    if (!partner || !partner.online) {
      return res.json([]);
    }

    const filter = { partnerId: req.user.id };
    
    if (req.query.status) {
      if (req.query.status === 'pending') {
        filter.status = { $in: ['assigned', 'navigating', 'arrived'] };
      } else if (req.query.status === 'completed') {
        filter.status = { $in: ['picked_up', 'completed'] };
      } else if (req.query.status === 'cancelled') {
        filter.status = 'cancelled';
      } else {
        filter.status = req.query.status;
      }
    } else if (req.query.history === 'true') {
      filter.status = { $in: ['picked_up', 'completed', 'cancelled'] };
    }
    // If no query parameters, return all orders by default for complete routing dashboard rendering

    const orders = await PickupOrder.find(filter)
      .populate('requestId')
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    next(err);
  }
};

const getOrderDetails = async (req, res, next) => {
  try {
    const order = await PickupOrder.findOne({
      _id: req.params.id,
      partnerId: req.user.id
    }).populate('requestId');

    if (!order) return res.status(404).json({ message: 'Order not found or access denied' });
    
    const enableOtp = process.env.ENABLE_OTP !== 'false';
    const orderObj = order.toObject();
    orderObj.enableOtp = enableOtp;
    
    res.json(orderObj);
  } catch (err) {
    next(err);
  }
};

const startOrderNavigation = async (req, res, next) => {
  try {
    const order = await PickupOrder.findOne({
      _id: req.params.id,
      partnerId: req.user.id
    });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.status !== 'assigned') {
      return res.status(400).json({ message: `Cannot start navigation for order in state '${order.status}'. Order must be 'assigned'.` });
    }

    order.status = 'navigating';
    if (!order.startedAt) {
      order.startedAt = new Date();
    }
    await order.save();

    await PickupTimeline.create({
      orderId: order._id,
      partnerId: order.partnerId,
      eventName: 'navigating',
      details: 'Pickup Partner started navigation to customer location.',
      latitude: req.body.latitude,
      longitude: req.body.longitude
    });

    res.json(order);
  } catch (err) {
    next(err);
  }
};

const arriveOrder = async (req, res, next) => {
  try {
    const order = await PickupOrder.findOne({
      _id: req.params.id,
      partnerId: req.user.id
    });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (!['assigned', 'navigating'].includes(order.status)) {
      return res.status(400).json({ message: `Cannot mark arrived for order in state '${order.status}'. Order must be 'assigned' or 'navigating'.` });
    }

    order.status = 'arrived';
    await order.save();

    await PickupTimeline.create({
      orderId: order._id,
      partnerId: order.partnerId,
      eventName: 'arrived',
      details: 'Pickup Partner arrived at customer location.',
      latitude: req.body.latitude,
      longitude: req.body.longitude
    });

    res.json(order);
  } catch (err) {
    next(err);
  }
};

const generateOtp = async (req, res, next) => {
  try {
    const order = await PickupOrder.findOne({
      _id: req.params.id,
      partnerId: req.user.id
    });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.status !== 'arrived') {
      return res.status(400).json({ message: `Cannot generate OTP for order in state '${order.status}'. Partner must arrive at customer location first.` });
    }

    // Check if verification is currently locked
    if (order.otpLockedUntil && Date.now() < new Date(order.otpLockedUntil).getTime()) {
      const remainingMins = Math.ceil((new Date(order.otpLockedUntil).getTime() - Date.now()) / 60000);
      return res.status(403).json({ message: `OTP verification is locked. Try again in ${remainingMins} minutes.` });
    }

    // Handle Resend restrictions
    if (order.otp) {
      // 1. Minimum 60-second cooldown
      if (order.otpGeneratedAt && (Date.now() - new Date(order.otpGeneratedAt).getTime() < 60 * 1000)) {
        const secondsLeft = Math.ceil((60 * 1000 - (Date.now() - new Date(order.otpGeneratedAt).getTime())) / 1000);
        return res.status(400).json({ message: `Please wait ${secondsLeft} seconds before requesting a new OTP.` });
      }
      // 2. Maximum 3 resend attempts
      if (order.otpResendsCount >= 3) {
        return res.status(400).json({ message: 'Maximum 3 resend attempts reached.' });
      }
      order.otpResendsCount = (order.otpResendsCount || 0) + 1;
    } else {
      order.otpResendsCount = 0;
    }

    // Validate phone number
    const request = await Request.findById(order.requestId);
    if (!request || !request.phone) {
      return res.status(400).json({ message: 'Customer phone number not found.' });
    }
    const cleanPhone = request.phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      return res.status(400).json({ message: 'Customer phone number is invalid. Must have at least 10 digits.' });
    }

    // Generate a secure 6-digit random code using crypto
    const otp = crypto.randomInt(100000, 999999).toString();
    
    // Send OTP SMS to customer first (only register in DB if SMS dispatch succeeds)
    let smsResult = { success: false };
    try {
      smsResult = await smsService.sendOTP(request.phone, otp);
    } catch (smsErr) {
      console.error(`❌ SMS Dispatch error:`, smsErr);
    }

    if (!smsResult || !smsResult.success) {
      order.otpStatus = 'Failed';
      await order.save();
      return res.status(500).json({ message: 'OTP delivery failed. Please try again.' });
    }

    // Store only SHA-256 hash of the OTP in the database
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    order.otp = otpHash;
    order.otpStatus = 'Sent';
    order.otpRequestId = smsResult.requestId;
    order.otpGeneratedAt = new Date();
    order.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
    order.otpFailedAttempts = 0;
    order.otpLockedUntil = undefined;
    order._test_otp = !smsService.enabled ? otp : undefined; // Store raw OTP on the model purely for development test fallback
    await order.save();

    await PickupTimeline.create({
      orderId: order._id,
      partnerId: order.partnerId,
      eventName: 'otp_generated',
      details: 'Customer OTP code has been generated and sent via SMS.',
      latitude: req.body.latitude,
      longitude: req.body.longitude
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔑 OTP Generated for Order ${order.orderId}: ${otp} (Hash: ${otpHash}, Expires: ${order.otpExpiresAt.toLocaleTimeString()})`);
    } else {
      console.log(`🔑 OTP Generated for Order ${order.orderId} (Hash: ${otpHash}, Expires: ${order.otpExpiresAt.toLocaleTimeString()})`);
    }

    // Broadcast OTP generation to admin dashboard
    eventBus.sendEvent('otp_generated', { orderId: order._id, partnerId: order.partnerId, timestamp: new Date() });

    const isTestMode = !smsService.enabled;
    res.json({ 
      message: 'OTP code generated successfully',
      ...(isTestMode ? { testOtp: otp } : {})
    });
  } catch (err) {
    next(err);
  }
};

const verifyOtpAndComplete = async (req, res, next) => {
  try {
    const { otp, extraDevices, notes, distanceTravelled, durationMinutes, latitude, longitude, finalPrice, remarks } = req.body;
    const order = await PickupOrder.findOne({
      _id: req.params.id,
      partnerId: req.user.id
    });

    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.status !== 'arrived') {
      return res.status(400).json({ message: `Cannot complete pickup for order in state '${order.status}'. Order must be in 'arrived' state.` });
    }

    // Check if verification is currently locked
    if (order.otpLockedUntil && Date.now() < new Date(order.otpLockedUntil).getTime()) {
      const remainingMins = Math.ceil((new Date(order.otpLockedUntil).getTime() - Date.now()) / 60000);
      return res.status(403).json({ message: `OTP verification is locked due to too many failed attempts. Try again in ${remainingMins} minutes.` });
    }

    if (!order.otp) return res.status(400).json({ message: 'Generate OTP first' });
    
    // Check expiration
    if (order.otpExpiresAt && Date.now() > new Date(order.otpExpiresAt).getTime()) {
      return res.status(400).json({ message: 'OTP code has expired. Please generate a new one.' });
    }

    // Verify SHA-256 hashed OTP
    const inputHash = crypto.createHash('sha256').update(otp || '').digest('hex');
    if (order.otp !== inputHash) {
      order.otpFailedAttempts = (order.otpFailedAttempts || 0) + 1;
      
      if (order.otpFailedAttempts >= 5) {
        order.otpLockedUntil = new Date(Date.now() + 15 * 60 * 1000); // Lock for 15 minutes
        console.warn(`[OTP LOCKOUT] Order ${order.orderId} locked for 15 minutes due to 5 failures. IP: ${req.ip}`);
      }
      
      await order.save();
      console.warn(`[OTP AUTH FAIL] Failed OTP attempt for Order ${order.orderId}. Input: ${otp}, Attempt: ${order.otpFailedAttempts}/${5}. IP: ${req.ip}`);
      
      return res.status(400).json({ message: `Invalid OTP code. Attempt ${order.otpFailedAttempts} of 5.` });
    }

    // OTP matched! Initialize a Mongoose transaction session for atomic updates
    const session = await mongoose.startSession();
    session.startTransaction();

    let request = null;
    let savedOrder = null;

    try {
      // Re-fetch order inside transaction session
      const txOrder = await PickupOrder.findOne({ _id: order._id }).session(session);
      if (!txOrder) throw new Error('Order not found in transaction context');

      txOrder.status = 'picked_up';
      txOrder.extraDevices = extraDevices || [];
      txOrder.notes = notes || '';
      txOrder.distanceTravelled = Number(distanceTravelled) || 0;
      txOrder.durationMinutes = Number(durationMinutes) || 0;
      txOrder.pickedUpAt = new Date();

      if (latitude !== undefined && latitude !== null) txOrder.pickupLatitude = Number(latitude);
      if (longitude !== undefined && longitude !== null) txOrder.pickupLongitude = Number(longitude);
      if (finalPrice !== undefined && finalPrice !== null && finalPrice !== '') txOrder.finalPrice = Number(finalPrice);
      if (remarks !== undefined && remarks !== null) txOrder.pickupRemarks = remarks;
      
      // Clear OTP fields strictly to prevent replay/reuse
      txOrder.otp = undefined;
      txOrder.otpStatus = 'Verified';
      txOrder.otpGeneratedAt = undefined;
      txOrder.otpExpiresAt = undefined;
      txOrder.otpFailedAttempts = 0;
      txOrder.otpLockedUntil = undefined;
      txOrder.otpResendsCount = 0;
      txOrder._test_otp = undefined;
      savedOrder = await txOrder.save({ session });

      // Update original customer request status to 'accepted' inside the transaction
      request = await Request.findByIdAndUpdate(txOrder.requestId, { status: 'accepted' }, { new: true, session });
      if (!request) {
        throw new Error('Associated customer request was not found');
      }

      await PickupTimeline.create([
        {
          orderId: txOrder._id,
          partnerId: txOrder.partnerId,
          eventName: 'picked_up',
          details: `Order completed successfully. Agreed Price: ₹${txOrder.finalPrice || 'N/A'}. Remarks: ${txOrder.pickupRemarks || 'None'}. Collected ${txOrder.extraDevices.length} extra devices.`,
          latitude: latitude,
          longitude: longitude
        }
      ], { session });

      // Commit the database updates atomically
      await session.commitTransaction();
      session.endSession();
    } catch (txErr) {
      // Abort the transaction if any write fails, rolling back all partial updates
      await session.abortTransaction();
      session.endSession();
      throw txErr;
    }

    // Decoupled notification dispatch (failure does not affect successful completion API)
    if (request) {
      // Send SMS
      try {
        if (request.phone) {
          console.log(`[NOTIFY QUEUE PREP] Queuing SMS notification for order ${savedOrder.orderId}`);
          await smsService.sendSMS(
            request.phone,
            `ScrapMe: Your pickup order ${savedOrder.orderId} has been successfully collected by our partner. A warehouse audit will take place shortly.`
          );
        }
      } catch (smsErr) {
        console.error(`[NOTIFICATION ERROR] Failed to dispatch SMS for order ${savedOrder.orderId}:`, smsErr.message);
      }

      // Send Email
      try {
        if (request.userEmail) {
          console.log(`[NOTIFY QUEUE PREP] Queuing Email notification for order ${savedOrder.orderId}`);
          const subject = `ScrapMe - Device Collection Completed (${savedOrder.orderId})`;
          const text = `Hello ${request.sellerName || 'Customer'},\n\nYour devices for order ${savedOrder.orderId} have been collected by our pickup partner ${req.user.name}.\n\nCollected Smartphone: ${request.brand} ${request.model}\nExtra Devices: ${savedOrder.extraDevices.length}\n\nOur warehouse team will perform the audit verification and finalize your payment shortly.\n\nThank you for selling on ScrapMe!\n\nBest regards,\nThe ScrapMe Team`;
          const html = `
            <p>Hello <strong>${request.sellerName || 'Customer'}</strong>,</p>
            <p>Your devices for order <strong>${savedOrder.orderId}</strong> have been collected by our pickup partner <strong>${req.user.name}</strong>.</p>
            <ul>
              <li>Collected Smartphone: ${request.brand} ${request.model}</li>
              <li>Extra Devices: ${savedOrder.extraDevices.length}</li>
            </ul>
            <p>Our warehouse team will perform the audit verification and finalize your payment shortly.</p>
            <p>Thank you for selling on ScrapMe!</p>
            <p>Best regards,<br>The ScrapMe Team</p>
          `;
          await emailService.sendEmail(request.userEmail, subject, text, html);
        }
      } catch (emailErr) {
        console.error(`[NOTIFICATION ERROR] Failed to dispatch Email for order ${savedOrder.orderId}:`, emailErr.message);
      }
    }

    eventBus.sendEvent('pickup_completed', {
      orderId: savedOrder._id,
      partnerId: savedOrder.partnerId,
      timestamp: new Date()
    });

    res.json({ message: 'OTP verified successfully. Pickup order status updated to Picked Up.', order: savedOrder });
  } catch (err) {
    next(err);
  }
};

const addExtraDevice = async (req, res, next) => {
  try {
    const { brand, model, storage, condition, estimatedPrice, imei, photoUrl } = req.body;
    const order = await PickupOrder.findOne({
      _id: req.params.id,
      partnerId: req.user.id
    });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (!['assigned', 'navigating', 'arrived'].includes(order.status)) {
      return res.status(400).json({ message: `Cannot add extra devices to order in state '${order.status}'.` });
    }

    order.extraDevices.push({ brand, model, storage, condition, estimatedPrice, imei, photoUrl });
    await order.save();

    res.json(order);
  } catch (err) {
    next(err);
  }
};

const updateGps = async (req, res, next) => {
  try {
    const { latitude, longitude, eta, battery, speed, accuracy, heading, timestamp } = req.body;
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: 'Latitude and Longitude are required' });
    }

    const latNum = Number(latitude);
    const lngNum = Number(longitude);

    // Security check: validate coordinate ranges
    if (isNaN(latNum) || isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      return res.status(400).json({ message: 'Invalid coordinates range' });
    }

    console.log(`[BACKEND GPS UPDATE] Request received from partner: ${req.user.id} (${req.user.name})`);
    console.log(`  - Coords: Lat: ${latNum}, Lng: ${lngNum} | Speed: ${speed} | Accuracy: ${accuracy} | Battery: ${battery}% | Heading: ${heading}`);

    // Get currently assigned active order
    const activeOrder = await PickupOrder.findOne({
      partnerId: req.user.id,
      status: { $in: ['assigned', 'navigating', 'arrived', 'picked_up'] }
    }).populate('requestId');

    const currentAssignedOrder = activeOrder ? activeOrder.orderId : '';

    // Retrieve existing location to prevent duplicate route coordinates
    let loc = await PickupLocation.findOne({ partnerId: req.user.id });
    let shouldPushRoute = true;

    if (loc) {
      console.log(`  - Existing stored coords: Lat: ${loc.latitude}, Lng: ${loc.longitude}`);
      console.log(`  - Delta change: Lat: ${latNum - loc.latitude}, Lng: ${lngNum - loc.longitude}`);
      
      if (loc.route && loc.route.length > 0) {
        const lastPoint = loc.route[loc.route.length - 1];
        const dist = getDistanceMeters(lastPoint[0], lastPoint[1], latNum, lngNum);
        if (dist < 2) {
          shouldPushRoute = false;
          console.log(`  - Coordinate delta distance is very small (${dist.toFixed(2)}m < 2m). Duplicate route push skipped.`);
        } else {
          console.log(`  - Coordinate delta distance: ${dist.toFixed(2)}m. Pushing to route.`);
        }
      }
    } else {
      console.log('  - No existing telemetry document found. Creating one.');
    }

    const updateFields = {
      latitude: latNum,
      longitude: lngNum,
      eta: eta || '',
      battery: battery !== undefined && battery !== null ? Number(battery) : undefined,
      speed: speed !== undefined && speed !== null ? Number(speed) : undefined,
      accuracy: accuracy !== undefined && accuracy !== null ? Number(accuracy) : undefined,
      heading: heading !== undefined && heading !== null ? Number(heading) : undefined,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      currentAssignedOrder,
      lastUpdated: new Date()
    };

    if (shouldPushRoute) {
      updateFields.$push = { route: [latNum, lngNum] };
    }

    loc = await PickupLocation.findOneAndUpdate(
      { partnerId: req.user.id },
      updateFields,
      { new: true, upsert: true }
    );

    // Call background reverse geocoder asynchronously
    updateReverseGeocode(loc, latNum, lngNum).catch(err => {
      console.error('[BACKGROUND GEOPROCESSOR ERROR]', err.message);
    });

    console.log(`  - DB save verified successfully. Fresh document coords: Lat: ${loc.latitude}, Lng: ${loc.longitude}`);

    // Fail-safe: ensure partner is marked online and active on GPS ping
    await PickupPartner.findByIdAndUpdate(req.user.id, {
      online: true,
      lastActive: new Date()
    });

    // Geofencing detects
    if (activeOrder) {
      const customerLat = activeOrder.requestId ? Number(activeOrder.requestId.latitude) : null;
      const customerLng = activeOrder.requestId ? Number(activeOrder.requestId.longitude) : null;

      if (customerLat !== null && customerLng !== null) {
        const distanceToCustomer = getDistanceMeters(latNum, lngNum, customerLat, customerLng);

        // 1. Detect arrival at customer
        if (activeOrder.status === 'navigating' && distanceToCustomer <= 100) {
          activeOrder.status = 'arrived';
          await activeOrder.save();

          const hasArrivedLog = await PickupTimeline.findOne({ orderId: activeOrder._id, eventName: 'arrived' });
          if (!hasArrivedLog) {
            await PickupTimeline.create({
              orderId: activeOrder._id,
              partnerId: req.user.id,
              eventName: 'arrived',
              details: `Automated Geofencing: Partner arrived within ${Math.round(distanceToCustomer)}m of customer location.`,
              latitude: latNum,
              longitude: lngNum
            });
            console.log(`[GEOFENCE] Order ${activeOrder.orderId} status set to arrived via geofencing.`);
            eventBus.sendEvent('order_arrived', { orderId: activeOrder._id, partnerId: req.user.id, timestamp: new Date() });
          }
        }

        // 2. Detect departure from customer
        if (activeOrder.status === 'picked_up' && distanceToCustomer > 200) {
          const hasDepartedLog = await PickupTimeline.findOne({ orderId: activeOrder._id, eventName: 'departed_customer' });
          if (!hasDepartedLog) {
            await PickupTimeline.create({
              orderId: activeOrder._id,
              partnerId: req.user.id,
              eventName: 'departed_customer',
              details: `Automated Geofencing: Partner departed customer location (${Math.round(distanceToCustomer)}m away).`,
              latitude: latNum,
              longitude: lngNum
            });
            console.log(`[GEOFENCE] Order ${activeOrder.orderId} departed customer location.`);
          }
        }
      }

      // 3. Detect arrival at ScrapMe warehouse
      if (activeOrder.status === 'picked_up') {
        const warehouseLat = Number(process.env.WAREHOUSE_LAT) || 13.0280;
        const warehouseLng = Number(process.env.WAREHOUSE_LNG) || 77.5895;
        const distanceToWarehouse = getDistanceMeters(latNum, lngNum, warehouseLat, warehouseLng);

        if (distanceToWarehouse <= 150) {
          const hasWarehouseLog = await PickupTimeline.findOne({ orderId: activeOrder._id, eventName: 'arrived_at_warehouse' });
          if (!hasWarehouseLog) {
            await PickupTimeline.create({
              orderId: activeOrder._id,
              partnerId: req.user.id,
              eventName: 'arrived_at_warehouse',
              details: `Automated Geofencing: Partner arrived within ${Math.round(distanceToWarehouse)}m of central warehouse.`,
              latitude: latNum,
              longitude: lngNum
            });
            console.log(`[GEOFENCE] Order ${activeOrder.orderId} arrived at central warehouse.`);
          }
        }
      }
    }

    eventBus.sendEvent('gps_update', {
      partnerId: req.user.id,
      latitude: latNum,
      longitude: lngNum,
      battery: battery !== undefined && battery !== null ? Number(battery) : undefined,
      speed: speed !== undefined && speed !== null ? Number(speed) : undefined,
      accuracy: accuracy !== undefined && accuracy !== null ? Number(accuracy) : undefined,
      heading: heading !== undefined && heading !== null ? Number(heading) : undefined,
      currentAssignedOrder,
      timestamp: timestamp ? new Date(timestamp) : new Date()
    });

    res.json(loc);
  } catch (err) {
    next(err);
  }
};

/* ─── IMAGE UPLOAD ────────────────────────────────── */
const uploadImage = async (req, res, next) => {
  try {
    const { base64Data } = req.body;
    if (!base64Data) {
      return res.status(400).json({ message: 'No base64 data provided' });
    }

    // 1. Check maximum file size (5MB limit)
    // Base64 encoding has a 4/3 overhead, so size in bytes is roughly string length * 0.75
    const estimatedSizeBytes = base64Data.length * 0.75;
    if (estimatedSizeBytes > 5 * 1024 * 1024) {
      return res.status(400).json({ message: 'File size exceeds the maximum limit of 5MB' });
    }

    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ message: 'Invalid image base64 format' });
    }

    // 2. Validate MIME type
    const mimeType = matches[1].toLowerCase();
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(mimeType)) {
      return res.status(400).json({ message: 'Invalid file type. Only JPEG, PNG, GIF, and WEBP images are allowed.' });
    }

    // 3. Validate file extension
    const ext = mimeType.split('/')[1] || 'jpg';
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    if (!allowedExtensions.includes(ext)) {
      return res.status(400).json({ message: 'Invalid file extension.' });
    }

    const imageBuffer = Buffer.from(matches[2], 'base64');
    const filename = `photo-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;

    const uploadDir = path.join(__dirname, '..', '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    fs.writeFileSync(path.join(uploadDir, filename), imageBuffer);
    const photoUrl = `/uploads/${filename}`;
    res.json({ photoUrl });
  } catch (err) {
    next(err);
  }
};

/* ─── WAREHOUSE PORTAL ────────────────────────────── */
const getWarehouseOrders = async (req, res, next) => {
  try {
    if (req.user.role !== 'warehouse') {
      return res.status(403).json({ message: 'Warehouse access denied' });
    }

    // Warehouse verifies orders that are picked up or already verified
    const orders = await PickupOrder.find({
      status: { $in: ['picked_up', 'completed'] }
    })
      .populate('requestId')
      .populate({ path: 'partnerId', select: 'name employeeId phone' })
      .sort({ updatedAt: -1 });

    res.json(orders);
  } catch (err) {
    next(err);
  }
};

const verifyWarehouseOrder = async (req, res, next) => {
  try {
    if (req.user.role !== 'warehouse') {
      return res.status(403).json({ message: 'Warehouse access denied' });
    }

    const { warehouseDevices, warehouseNotes } = req.body;
    const order = await PickupOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.status !== 'picked_up') {
      return res.status(400).json({ message: `Warehouse verification failed: Order is in state '${order.status}'. Must be 'picked_up'.` });
    }

    // Determine discrepancy
    const hasIssues = warehouseDevices.some(d => d.status === 'missing' || d.status === 'damaged');
    const statusResult = hasIssues ? 'discrepancy' : 'verified';

    order.warehouseDevices = warehouseDevices;
    order.warehouseNotes = warehouseNotes || '';
    order.warehouseVerified = true;
    order.warehouseVerifiedAt = new Date();
    order.warehouseStatus = statusResult;
    order.status = 'completed';
    order.completedAt = new Date();
    await order.save();

    // Update customer request status to 'completed'
    await Request.findByIdAndUpdate(order.requestId, { status: 'completed' });

    try {
      const { calculateCommission } = require('../utils/affiliateHelper');
      await calculateCommission(order.requestId);
    } catch (err) {
      console.error('Failed to trigger affiliate commission calculation on warehouse verification:', err);
    }

    await PickupTimeline.create({
      orderId: order._id,
      partnerId: order.partnerId,
      eventName: 'warehouse_verified',
      details: `Warehouse verification completed with status: ${statusResult.toUpperCase()}. Notes: ${warehouseNotes || 'none'}`
    });

    res.json({ message: 'Warehouse audit completed successfully', order });
  } catch (err) {
    next(err);
  }
};

/* ─── ADMIN OPERATIONS MANAGEMENT ─────────────────── */
const adminGetPartners = async (req, res, next) => {
  try {
    const partners = await PickupPartner.find({}).select('-password');
    res.json(partners);
  } catch (err) {
    next(err);
  }
};

const adminCreatePartner = async (req, res, next) => {
  try {
    const { name, phone, employeeId, password, role, email, profilePhoto, assignedZone, vehicleDetails, joiningDate } = req.body;
    if (!name || !phone || !employeeId || !password) {
      return res.status(400).json({ message: 'All partner fields are required' });
    }

    const exists = await PickupPartner.findOne({ employeeId: employeeId.toUpperCase() });
    if (exists) {
      return res.status(400).json({ message: 'Employee ID is already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const partner = await PickupPartner.create({
      name,
      phone,
      employeeId: employeeId.toUpperCase(),
      password: hashedPassword,
      role: role || 'partner',
      email: email || '',
      profilePhoto: profilePhoto || '/uploads/default-avatar.png',
      assignedZone: assignedZone || 'General',
      vehicleDetails: vehicleDetails || 'Motorcycle',
      joiningDate: joiningDate || new Date()
    });

    const result = partner.toObject();
    delete result.password;
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

const adminUpdatePartner = async (req, res, next) => {
  try {
    const { name, phone, active, role, password, email, profilePhoto, assignedZone, vehicleDetails } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (phone) updates.phone = phone;
    if (active !== undefined) updates.active = !!active;
    if (role) updates.role = role;
    if (email !== undefined) updates.email = email;
    if (profilePhoto !== undefined) updates.profilePhoto = profilePhoto;
    if (assignedZone !== undefined) updates.assignedZone = assignedZone;
    if (vehicleDetails !== undefined) updates.vehicleDetails = vehicleDetails;
    if (password) {
      updates.password = await bcrypt.hash(password, 10);
    }

    const partner = await PickupPartner.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    ).select('-password');

    if (!partner) return res.status(404).json({ message: 'Partner not found' });
    res.json(partner);
  } catch (err) {
    next(err);
  }
};

const adminAssignOrder = async (req, res, next) => {
  try {
    const { requestId, partnerId } = req.body;
    if (!requestId || !partnerId) {
      return res.status(400).json({ message: 'Request ID and Partner ID are required' });
    }

    // Verify request
    const request = await Request.findById(requestId);
    if (!request) return res.status(404).json({ message: 'Customer Request not found' });

    // Verify partner
    const partner = await PickupPartner.findById(partnerId);
    if (!partner) return res.status(404).json({ message: 'Pickup Partner not found' });
    if (!partner.active) return res.status(400).json({ message: 'Partner is inactive and cannot be assigned' });

    // Check if an active (non-cancelled) order already exists
    const existingOrder = await PickupOrder.findOne({ requestId, status: { $ne: 'cancelled' } });
    if (existingOrder) {
      return res.status(400).json({
        message: 'A Pickup Order has already been assigned to this request',
        order: existingOrder
      });
    }

    // Auto-generate PO number: PO-2026-######
    const year = new Date().getFullYear();
    const prefix = `PO-${year}-`;
    const latestOrder = await PickupOrder.findOne({ orderId: new RegExp(`^${prefix}`) })
      .sort({ orderId: -1 })
      .exec();

    let nextSeq = 1;
    if (latestOrder) {
      const parts = latestOrder.orderId.split('-');
      const seq = parseInt(parts[2], 10);
      if (!isNaN(seq)) {
        nextSeq = seq + 1;
      }
    }
    const orderIdStr = `${prefix}${String(nextSeq).padStart(6, '0')}`;

    const order = await PickupOrder.create({
      orderId: orderIdStr,
      requestId,
      partnerId
    });

    // Update Request status to approved or completed
    request.status = 'approved';
    await request.save();

    // Create log timeline
    await PickupTimeline.create({
      orderId: order._id,
      partnerId: partner._id,
      eventName: 'assigned',
      details: `Order assigned to ${partner.name} (${partner.employeeId}).`
    });

    // Notify Customer (SMS & Email)
    if (request.phone) {
      await smsService.sendSMS(
        request.phone,
        `ScrapMe: Your pickup for Order ${order.orderId} is assigned to ${partner.name} (ph: ${partner.phone}). They will reach you shortly.`
      );
    }
    if (request.userEmail) {
      const subject = `ScrapMe - Pickup Partner Assigned (${order.orderId})`;
      const text = `Hello ${request.sellerName || 'Customer'},\n\nYour phone sell request has been approved and assigned for collection.\n\nOrder ID: ${order.orderId}\nPickup Partner: ${partner.name}\nPartner Phone: ${partner.phone}\nDevice: ${request.brand} ${request.model} (${request.storage})\n\nOur partner will contact you shortly to coordinate arrival. Please keep your device ready.\n\nBest regards,\nThe ScrapMe Team`;
      const html = `
        <p>Hello <strong>${request.sellerName || 'Customer'}</strong>,</p>
        <p>Your phone sell request has been approved and assigned for collection.</p>
        <p><strong>Order Details:</strong></p>
        <ul>
          <li><strong>Order ID:</strong> ${order.orderId}</li>
          <li><strong>Pickup Partner:</strong> ${partner.name}</li>
          <li><strong>Partner Phone:</strong> ${partner.phone}</li>
          <li><strong>Device:</strong> ${request.brand} ${request.model} (${request.storage})</li>
        </ul>
        <p>Our partner will contact you shortly to coordinate arrival. Please keep your device ready.</p>
        <p>Best regards,<br>The ScrapMe Team</p>
      `;
      await emailService.sendEmail(request.userEmail, subject, text, html);
    }

    // Notify Pickup Partner (SMS)
    if (partner.phone) {
      await smsService.sendSMS(
        partner.phone,
        `ScrapMe: New job assigned! Order: ${order.orderId}. Customer: ${request.sellerName} (ph: ${request.phone}), Address: ${request.address}`
      );
    }

    eventBus.sendEvent('assignment_change', { orderId: order._id, partnerId, type: 'assigned' });

    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
};

const adminGetPerformanceDashboard = async (req, res, next) => {
  try {
    const partners = await PickupPartner.find({ role: 'partner' });
    const dashboard = [];

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    for (const p of partners) {
      const orders = await PickupOrder.find({ partnerId: p._id }).populate('requestId');
      const loc = await PickupLocation.findOne({ partnerId: p._id });

      const completed = orders.filter(o => o.status === 'completed' || o.warehouseVerified);
      const pending = orders.filter(o => ['assigned', 'navigating', 'arrived'].includes(o.status));
      const todayPickups = orders.filter(o => {
        const checkDate = o.pickedUpAt || o.completedAt || o.updatedAt;
        return checkDate && checkDate >= startOfToday;
      });

      // Total revenue collected (Sum of original request priceNum + extra devices prices) for picked_up/completed orders
      let totalRevenue = 0;
      let totalDevices = 0;
      let totalDistance = 0;
      let totalDuration = 0;
      let countForAvg = 0;

      orders.forEach(o => {
        if (['picked_up', 'completed'].includes(o.status) || o.warehouseVerified) {
          // Original request
          if (o.requestId && o.requestId.priceNum) {
            totalRevenue += o.requestId.priceNum;
          }
          totalDevices += 1; // Original device

          // Extra devices
          if (o.extraDevices && o.extraDevices.length > 0) {
            totalDevices += o.extraDevices.length;
            o.extraDevices.forEach(d => {
              if (d.estimatedPrice) totalRevenue += d.estimatedPrice;
            });
          }

          totalDistance += o.distanceTravelled || 0;

          if (o.startedAt && o.pickedUpAt) {
            const diffMs = o.pickedUpAt - o.startedAt;
            totalDuration += diffMs / (1000 * 60); // minutes
            countForAvg += 1;
          }
        }
      });

      const avgPickupTime = countForAvg > 0 ? Math.round(totalDuration / countForAvg) : 0;

      dashboard.push({
        partner: {
          id: p._id,
          _id: p._id,
          name: p.name,
          employeeId: p.employeeId,
          phone: p.phone,
          active: p.active,
          online: p.online,
          profilePhoto: p.profilePhoto,
          lastActive: p.lastActive
        },
        todayPickups: todayPickups.length,
        completedPickups: completed.length,
        pendingPickups: pending.length,
        totalDevicesCollected: totalDevices,
        totalRevenueCollected: totalRevenue,
        distanceTravelled: Math.round(totalDistance * 10) / 10,
        averagePickupTime: avgPickupTime, // in minutes
        gpsTimestamp: loc ? loc.lastUpdated : null,
        battery: loc ? loc.battery : null
      });
    }

    res.json(dashboard);
  } catch (err) {
    next(err);
  }
};

const adminGetLiveLocations = async (req, res, next) => {
  try {
    const locations = await PickupLocation.find({})
      .populate({ path: 'partnerId', select: 'name employeeId phone active role online lastActive' });
    
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const locationsWithStats = await Promise.all(locations.map(async (loc) => {
      const partnerId = loc.partnerId ? loc.partnerId._id : null;
      if (!partnerId) return loc.toObject();

      // Query completed/picked_up orders today
      const completedTodayCount = await PickupOrder.countDocuments({
        partnerId,
        status: { $in: ['completed', 'picked_up'] },
        updatedAt: { $gte: startOfToday }
      });

      // Calculate today's distance from route
      let todayDistanceKm = 0;
      if (loc.route && loc.route.length > 1) {
        for (let i = 0; i < loc.route.length - 1; i++) {
          const [lat1, lon1] = loc.route[i];
          const [lat2, lon2] = loc.route[i+1];
          todayDistanceKm += getDistanceMeters(lat1, lon1, lat2, lon2) / 1000;
        }
      }

      const obj = loc.toObject();
      obj.completedTodayCount = completedTodayCount;
      obj.todayDistanceKm = Number(todayDistanceKm.toFixed(2));
      return obj;
    }));

    res.json(locationsWithStats);
  } catch (err) {
    next(err);
  }
};

const adminGetOrderByRequestId = async (req, res, next) => {
  try {
    const order = await PickupOrder.findOne({ requestId: req.params.requestId })
      .populate({ path: 'partnerId', select: 'name employeeId phone' });
    if (!order) return res.status(404).json({ message: 'No assignment found' });
    res.json(order);
  } catch (err) {
    next(err);
  }
};

const updateDutyStatus = async (req, res, next) => {
  try {
    const { online } = req.body;

    const beforePartner = await PickupPartner.findById(req.user.id);
    console.log(`[BACKEND DUTY UPDATE] Before Save Document:`, beforePartner ? {
      _id: beforePartner._id,
      name: beforePartner.name,
      online: beforePartner.online,
      lastActive: beforePartner.lastActive
    } : 'null');

    const partner = await PickupPartner.findByIdAndUpdate(
      req.user.id,
      { online: !!online, lastActive: new Date() },
      { new: true }
    ).select('-password');

    console.log(`[BACKEND DUTY UPDATE] After Save Document:`, {
      _id: partner._id,
      name: partner.name,
      online: partner.online,
      lastActive: partner.lastActive
    });

    const verifyPartner = await mongoose.connection.db.collection('pickuppartners').findOne({ _id: partner._id });
    console.log(`[MONGODB READ CONFIRM] Immediately read from DB:`, {
      _id: verifyPartner._id,
      name: verifyPartner.name,
      online: verifyPartner.online,
      lastActive: verifyPartner.lastActive,
      statusText: verifyPartner.online ? 'online' : 'offline',
      lastSeen: verifyPartner.lastActive
    });

    await PickupTimeline.create({
      partnerId: partner._id,
      eventName: partner.online ? 'went_online' : 'went_offline',
      details: `${partner.name} went ${partner.online ? 'Online' : 'Offline'}.`
    });

    eventBus.sendEvent('partner_status_change', {
      partnerId: partner._id,
      name: partner.name,
      online: partner.online,
      lastActive: partner.lastActive,
      employeeId: partner.employeeId,
      role: partner.role
    });

    res.json({ message: `Duty status updated to ${partner.online ? 'Online' : 'Offline'}`, online: partner.online });
  } catch (err) {
    next(err);
  }
};

const cancelOrder = async (req, res, next) => {
  try {
    const { reason, cancelledBy } = req.body;
    const order = await PickupOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Enforce partner scopes
    if (req.user.role !== 'admin' && String(order.partnerId) !== req.user.id) {
      return res.status(403).json({ message: 'Access denied: Cannot cancel this order' });
    }

    if (!['assigned', 'navigating', 'arrived'].includes(order.status)) {
      return res.status(400).json({ message: `Cannot cancel order in state '${order.status}'. Orders already picked up or completed cannot be cancelled.` });
    }

    order.status = 'cancelled';
    order.cancellationReason = reason || 'No reason provided';
    order.cancelledBy = cancelledBy || (req.user.role === 'admin' ? 'admin' : 'partner');
    order.cancelledAt = new Date();
    await order.save();

    // Release original request back to 'pending' state
    await Request.findByIdAndUpdate(order.requestId, { status: 'pending' });

    await PickupTimeline.create({
      orderId: order._id,
      partnerId: order.partnerId,
      eventName: 'cancelled',
      details: `Order cancelled by ${order.cancelledBy}. Reason: ${order.cancellationReason}`
    });

    const request = await Request.findById(order.requestId);
    if (request) {
      if (request.phone) {
        await smsService.sendSMS(
          request.phone,
          `ScrapMe: Your pickup order ${order.orderId} has been cancelled. Reason: ${order.cancellationReason}`
        );
      }
      if (request.userEmail) {
        const subject = `ScrapMe - Pickup Order Cancelled (${order.orderId})`;
        const text = `Hello ${request.sellerName || 'Customer'},\n\nYour pickup order ${order.orderId} has been cancelled.\n\nReason: ${order.cancellationReason}\n\nYour request is now returned to pending for another pickup partner assignment.\n\nBest regards,\nThe ScrapMe Team`;
        const html = `
          <p>Hello <strong>${request.sellerName || 'Customer'}</strong>,</p>
          <p>Your pickup order <strong>${order.orderId}</strong> has been cancelled.</p>
          <p><strong>Cancellation Reason:</strong> ${order.cancellationReason}</p>
          <p>Your request is now returned to pending for another pickup partner assignment.</p>
          <p>Best regards,<br>The ScrapMe Team</p>
        `;
        await emailService.sendEmail(request.userEmail, subject, text, html);
      }
    }

    eventBus.sendEvent('assignment_change', {
      orderId: order._id,
      partnerId: order.partnerId,
      type: 'cancelled'
    });

    res.json({ message: 'Order cancelled successfully', order });
  } catch (err) {
    next(err);
  }
};

const getPartnerStats = async (req, res, next) => {
  try {
    const orders = await PickupOrder.find({ partnerId: req.user.id }).populate('requestId');
    
    const startOfToday = new Date();
    startOfToday.setHours(0,0,0,0);

    const todayPickups = orders.filter(o => {
      const checkDate = o.pickedUpAt || o.completedAt || o.updatedAt;
      return checkDate && checkDate >= startOfToday;
    });

    const completedToday = todayPickups.filter(o => o.status === 'completed' || o.warehouseVerified).length;
    const completedAll = orders.filter(o => o.status === 'completed' || o.warehouseVerified || o.status === 'picked_up').length;
    const pending = orders.filter(o => ['assigned', 'navigating', 'arrived'].includes(o.status)).length;
    const cancelled = orders.filter(o => o.status === 'cancelled').length;

    let totalDevices = 0;
    let estValue = 0;

    const pickedUpOrders = orders.filter(o => ['picked_up', 'completed'].includes(o.status) || o.warehouseVerified);
    pickedUpOrders.forEach(o => {
      totalDevices += 1;
      if (o.extraDevices) {
        totalDevices += o.extraDevices.length;
        o.extraDevices.forEach(ed => {
          estValue += Number(ed.estimatedPrice) || 0;
        });
      }
      if (o.requestId && o.requestId.price) {
        const val = parseInt(o.requestId.price.replace(/[^\d]/g, ''), 10) || 0;
        estValue += val;
      }
    });

    // Calculate today's value collected
    let todayValue = 0;
    const pickedUpToday = todayPickups.filter(o => ['picked_up', 'completed'].includes(o.status) || o.warehouseVerified);
    pickedUpToday.forEach(o => {
      if (o.requestId && o.requestId.price) {
        todayValue += parseInt(o.requestId.price.replace(/[^\d]/g, ''), 10) || 0;
      }
      if (o.extraDevices) {
        o.extraDevices.forEach(ed => {
          todayValue += Number(ed.estimatedPrice) || 0;
        });
      }
    });

    res.json({
      todayPickups: todayPickups.length,
      completedToday,
      completedAll,
      pending,
      cancelled,
      totalDevicesCollected: totalDevices,
      estimatedCollectionValue: estValue,
      todayEstimatedValue: todayValue
    });
  } catch (err) {
    next(err);
  }
};

const adminGetPartnerProfile = async (req, res, next) => {
  try {
    const partner = await PickupPartner.findById(req.params.id).select('-password');
    if (!partner) return res.status(404).json({ message: 'Partner not found' });

    const orders = await PickupOrder.find({ partnerId: partner._id })
      .populate('requestId')
      .sort({ createdAt: -1 });

    const totalAssigned = orders.length;
    const completed = orders.filter(o => o.status === 'completed' || o.warehouseVerified).length;
    const pending = orders.filter(o => ['assigned', 'navigating', 'arrived', 'picked_up'].includes(o.status) && !o.warehouseVerified).length;
    const cancelled = orders.filter(o => o.status === 'cancelled').length;

    const completionRate = totalAssigned > 0 ? Math.round((completed / totalAssigned) * 100) : 0;
    const cancellationRate = totalAssigned > 0 ? Math.round((cancelled / totalAssigned) * 100) : 0;

    let totalDevicesCollected = 0;
    let totalValueCollected = 0;
    let totalDistance = 0;
    let totalDuration = 0;
    let durationCount = 0;

    const pickedUpOrders = orders.filter(o => ['picked_up', 'completed'].includes(o.status) || o.warehouseVerified);
    
    pickedUpOrders.forEach(o => {
      totalDevicesCollected += 1;
      if (o.extraDevices) {
        totalDevicesCollected += o.extraDevices.length;
        o.extraDevices.forEach(ed => {
          totalValueCollected += Number(ed.estimatedPrice) || 0;
        });
      }
      if (o.requestId && o.requestId.price) {
        const priceNum = parseInt(o.requestId.price.replace(/[^\d]/g, ''), 10) || 0;
        totalValueCollected += priceNum;
      }
      totalDistance += o.distanceTravelled || 0;
      
      if (o.startedAt && o.pickedUpAt) {
        const diffMs = new Date(o.pickedUpAt) - new Date(o.startedAt);
        totalDuration += Math.round(diffMs / 60000);
        durationCount++;
      } else if (o.durationMinutes > 0) {
        totalDuration += o.durationMinutes;
        durationCount++;
      }
    });

    const averagePickupTime = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;
    const averageDevicesPerPickup = completed > 0 ? Number((totalDevicesCollected / completed).toFixed(1)) : 0;

    // Current active order assigned to partner
    const currentOrder = orders.find(o => ['assigned', 'navigating', 'arrived'].includes(o.status));
    const currentPickup = currentOrder ? {
      _id: currentOrder._id,
      orderId: currentOrder.orderId,
      status: currentOrder.status,
      customerName: currentOrder.requestId ? currentOrder.requestId.sellerName : 'N/A'
    } : null;

    // Today's orders count
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayOrdersCount = orders.filter(o => new Date(o.createdAt) >= startOfToday).length;

    // Route travelled today, current destination & ETA
    const locationDoc = await PickupLocation.findOne({ partnerId: partner._id });
    
    let routeDistanceKm = 0;
    if (locationDoc && locationDoc.route && locationDoc.route.length > 1) {
      for (let i = 0; i < locationDoc.route.length - 1; i++) {
        const [lat1, lon1] = locationDoc.route[i];
        const [lat2, lon2] = locationDoc.route[i+1];
        routeDistanceKm += getDistanceMeters(lat1, lon1, lat2, lon2) / 1000;
      }
    }

    // Time online calculations
    const todayTimeline = await PickupTimeline.find({
      partnerId: partner._id,
      timestamp: { $gte: startOfToday },
      eventName: { $in: ['went_online', 'went_offline'] }
    }).sort({ timestamp: 1 });

    let timeOnlineMs = 0;
    let lastOnlineTime = null;

    todayTimeline.forEach(event => {
      if (event.eventName === 'went_online') {
        lastOnlineTime = new Date(event.timestamp);
      } else if (event.eventName === 'went_offline' && lastOnlineTime) {
        timeOnlineMs += (new Date(event.timestamp) - lastOnlineTime);
        lastOnlineTime = null;
      }
    });

    if (partner.online && lastOnlineTime) {
      timeOnlineMs += (Date.now() - lastOnlineTime);
    } else if (partner.online && !lastOnlineTime) {
      timeOnlineMs += (Date.now() - new Date(partner.lastActive || startOfToday));
    }
    const timeOnlineMins = Math.round(timeOnlineMs / 60000);

    const completedTodayCount = orders.filter(o => 
      (o.status === 'completed' || o.warehouseVerified || o.status === 'picked_up') && 
      new Date(o.pickedUpAt || o.createdAt) >= startOfToday
    ).length;

    const currentDestination = currentOrder && currentOrder.requestId ? currentOrder.requestId.address : 'N/A';

    // Recent activity timeline
    const timeline = await PickupTimeline.find({
      $or: [
        { partnerId: partner._id },
        { orderId: { $in: orders.map(o => o._id) } }
      ]
    }).sort({ timestamp: -1 }).limit(20);

    const history = orders.map(o => {
      let deviceCount = 1;
      let devicesCollected = 0;
      if (o.extraDevices) deviceCount += o.extraDevices.length;
      if (['picked_up', 'completed'].includes(o.status) || o.warehouseVerified) {
        devicesCollected = deviceCount;
      }

      let estValue = 0;
      if (o.requestId && o.requestId.price) {
        estValue += parseInt(o.requestId.price.replace(/[^\d]/g, ''), 10) || 0;
      }
      if (o.extraDevices) {
        o.extraDevices.forEach(ed => {
          estValue += Number(ed.estimatedPrice) || 0;
        });
      }

      return {
        _id: o._id,
        orderId: o.orderId,
        customerName: o.requestId ? o.requestId.sellerName : 'N/A',
        phone: o.requestId ? o.requestId.phone : 'N/A',
        address: o.requestId ? o.requestId.address : 'N/A',
        deviceCount,
        devicesCollected,
        estimatedValue: estValue,
        status: o.status,
        assignedDate: o.createdAt,
        completionDate: o.completedAt || o.pickedUpAt || null
      };
    });

    res.json({
      partner,
      statistics: {
        totalOrdersAssigned: totalAssigned,
        totalOrdersCompleted: completed,
        totalPendingOrders: pending,
        totalCancelledOrders: cancelled,
        completionRate,
        cancellationRate,
        averagePickupTime,
        totalDevicesCollected,
        totalEstimatedCollectionValue: totalValueCollected,
        averageDevicesPerPickup,
        totalDistanceTravelled: totalDistance,
        lastActive: partner.lastActive,
        todayOrdersCount,
        // Added production GPS telemetry stats:
        completedTodayCount,
        timeOnlineMins,
        todayDistanceKm: Number(routeDistanceKm.toFixed(2)),
        currentDestination,
        eta: locationDoc ? locationDoc.eta || 'N/A' : 'N/A',
        route: locationDoc ? locationDoc.route : [],
        // New GPS Telemetry Profile parameters
        latitude: locationDoc ? locationDoc.latitude : null,
        longitude: locationDoc ? locationDoc.longitude : null,
        speed: locationDoc ? locationDoc.speed : null,
        accuracy: locationDoc ? locationDoc.accuracy : null,
        heading: locationDoc ? locationDoc.heading : null,
        battery: locationDoc ? locationDoc.battery : null,
        address: locationDoc ? locationDoc.address : '',
        gpsTimestamp: locationDoc ? (locationDoc.lastUpdated || locationDoc.timestamp) : null
      },
      currentPickup,
      timeline,
      history
    });
  } catch (err) {
    next(err);
  }
};

const adminGetOrderDetails = async (req, res, next) => {
  try {
    const order = await PickupOrder.findById(req.params.id)
      .populate('requestId')
      .populate({ path: 'partnerId', select: '-password' });
      
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const timeline = await PickupTimeline.find({ orderId: order._id }).sort({ createdAt: 1 });
    const location = await PickupLocation.findOne({ partnerId: order.partnerId });

    res.json({
      order,
      timeline,
      location
    });
  } catch (err) {
    next(err);
  }
};

const adminGetAnalytics = async (req, res, next) => {
  try {
    const orders = await PickupOrder.find().populate('requestId');
    
    const total = orders.length;
    const completed = orders.filter(o => o.status === 'completed' || o.warehouseVerified).length;
    const cancelled = orders.filter(o => o.status === 'cancelled').length;
    const pending = total - completed - cancelled;

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const cancellationRate = total > 0 ? Math.round((cancelled / total) * 100) : 0;

    const pickedUpOrders = orders.filter(o => ['picked_up', 'completed'].includes(o.status) || o.warehouseVerified);
    let totalDevicesCollected = 0;
    let revenueCollected = 0;

    pickedUpOrders.forEach(o => {
      totalDevicesCollected += 1;
      if (o.extraDevices && o.extraDevices.length > 0) {
        totalDevicesCollected += o.extraDevices.length;
        o.extraDevices.forEach(ed => {
          revenueCollected += Number(ed.estimatedPrice) || 0;
        });
      }
      if (o.requestId && o.requestId.price) {
        const priceNum = parseInt(o.requestId.price.replace(/[^\d]/g, ''), 10) || 0;
        revenueCollected += priceNum;
      }
    });

    const avgDevicesPerPickup = pickedUpOrders.length > 0 ? Number((totalDevicesCollected / pickedUpOrders.length).toFixed(1)) : 0;

    let totalDuration = 0;
    let durationCount = 0;
    pickedUpOrders.forEach(o => {
      if (o.startedAt && o.pickedUpAt) {
        const diffMs = new Date(o.pickedUpAt) - new Date(o.startedAt);
        totalDuration += Math.round(diffMs / 60000);
        durationCount++;
      } else if (o.durationMinutes > 0) {
        totalDuration += o.durationMinutes;
        durationCount++;
      }
    });
    const avgPickupDuration = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;

    const weeklyDataMap = {};
    const oneDay = 24 * 60 * 60 * 1000;
    const now = new Date();

    for (let i = 0; i < 4; i++) {
      const date = new Date(now.getTime() - i * 7 * oneDay);
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - date.getDay()); // Sunday
      startOfWeek.setHours(0,0,0,0);
      const weekKey = startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      weeklyDataMap[weekKey] = { completed: 0, cancelled: 0 };
    }

    orders.forEach(o => {
      const date = o.completedAt || o.pickedUpAt || o.createdAt;
      if (date) {
        const startOfWeek = new Date(date);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        startOfWeek.setHours(0,0,0,0);
        const weekKey = startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (weeklyDataMap[weekKey]) {
          if (o.status === 'completed' || o.warehouseVerified) {
            weeklyDataMap[weekKey].completed++;
          } else if (o.status === 'cancelled') {
            weeklyDataMap[weekKey].cancelled++;
          }
        }
      }
    });

    const weeklyPerformance = Object.keys(weeklyDataMap).map(key => ({
      week: key,
      completed: weeklyDataMap[key].completed,
      cancelled: weeklyDataMap[key].cancelled
    })).reverse();

    const monthlyDataMap = {};
    for (let i = 0; i < 6; i++) {
      const d = new Date();
      d.setMonth(now.getMonth() - i);
      const monthKey = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      monthlyDataMap[monthKey] = { completed: 0, cancelled: 0 };
    }

    orders.forEach(o => {
      const date = o.completedAt || o.pickedUpAt || o.createdAt;
      if (date) {
        const monthKey = new Date(date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        if (monthlyDataMap[monthKey]) {
          if (o.status === 'completed' || o.warehouseVerified) {
            monthlyDataMap[monthKey].completed++;
          } else if (o.status === 'cancelled') {
            monthlyDataMap[monthKey].cancelled++;
          }
        }
      }
    });

    const monthlyPerformance = Object.keys(monthlyDataMap).map(key => ({
      month: key,
      completed: monthlyDataMap[key].completed,
      cancelled: monthlyDataMap[key].cancelled
    })).reverse();

    res.json({
      totalOrders: total,
      completedOrders: completed,
      pendingOrders: pending,
      cancelledOrders: cancelled,
      completionRate,
      cancellationRate,
      avgDevicesPerPickup,
      avgPickupDuration,
      revenueCollected,
      weeklyPerformance,
      monthlyPerformance
    });
  } catch (err) {
    next(err);
  }
};

const handleMsg91Webhook = async (req, res, next) => {
  try {
    console.log('[MSG91 WEBHOOK] Incoming payload:', JSON.stringify(req.body));
    
    let requestId = req.body.requestId || req.body.request_id;
    let desc = req.body.desc || req.body.description;
    let status = req.body.status;
    let number = req.body.number || req.body.telNum;

    // Handle array formats (e.g. v4 CleverTap format)
    if (Array.isArray(req.body)) {
      const eventObj = req.body[0];
      if (eventObj) {
        desc = eventObj.event; // e.g. "delivered", "failed"
        if (eventObj.data && eventObj.data[0]) {
          requestId = eventObj.data[0].requestId || eventObj.data[0].request_id;
          desc = eventObj.data[0].description || desc;
        }
      }
    }

    let order = null;

    // 1. Try finding by otpRequestId
    if (requestId) {
      order = await PickupOrder.findOne({ otpRequestId: requestId }).populate('requestId');
    }

    // 2. Try finding by phone number as fallback
    if (!order && number) {
      const cleanWebhookPhone = number.replace(/\D/g, ''); // strip to digits
      // Find orders that are not completed/cancelled
      const activeOrders = await PickupOrder.find({
        status: { $in: ['assigned', 'navigating', 'arrived'] }
      }).populate('requestId');

      order = activeOrders.find(o => {
        if (o.requestId && o.requestId.phone) {
          const cleanOrderPhone = o.requestId.phone.replace(/\D/g, '');
          return cleanOrderPhone.endsWith(cleanWebhookPhone) || cleanWebhookPhone.endsWith(cleanOrderPhone);
        }
        return false;
      });
    }

    if (!order) {
      console.warn(`[MSG91 WEBHOOK] No active order found matching Request ID: ${requestId} or Phone: ${number}`);
      return res.status(200).json({ message: 'No matching active order found' });
    }

    // Normalize MSG91 status codes & descriptions to our enum:
    // ['Not Generated', 'Sent', 'Delivered', 'Verified', 'Expired', 'Failed']
    let newStatus = 'Sent';
    const descUpper = (desc || '').toUpperCase();
    const statusStr = String(status || '');

    if (descUpper === 'DELIVERED' || descUpper === 'SUCCESS' || statusStr === '1') {
      newStatus = 'Delivered';
    } else if (
      descUpper === 'FAILED' || 
      descUpper === 'REJECTED' || 
      descUpper === 'BLOCKED' || 
      statusStr === '2' || 
      statusStr === '16' || 
      statusStr === '17' || 
      statusStr === '25'
    ) {
      newStatus = 'Failed';
    }

    // Only update if currently Sent/Failed (do not overwrite Verified or Expired status)
    if (order.otpStatus === 'Sent' || order.otpStatus === 'Failed' || order.otpStatus === 'Not Generated') {
      order.otpStatus = newStatus;
      await order.save();

      console.log(`[MSG91 WEBHOOK] Order ${order.orderId} OTP Status updated to: ${newStatus}`);
      
      // Notify Admin Portal dynamically via Event Bus
      eventBus.sendEvent('otp_delivery_update', {
        orderId: order._id,
        otpStatus: newStatus,
        timestamp: new Date()
      });
    }

    res.status(200).json({ success: true, message: 'Status updated' });
  } catch (err) {
    console.error('[MSG91 WEBHOOK ERROR] Exception handling callback:', err);
    // Return 200 to MSG91 so they don't loop retrying, but log the error
    res.status(200).json({ success: false, error: err.message });
  }
};

const saveCustomerCoordinates = async (req, res, next) => {
  try {
    const { latitude, longitude } = req.body;
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: 'Latitude and Longitude are required' });
    }
    const order = await PickupOrder.findOne({
      _id: req.params.id,
      partnerId: req.user.id
    });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const request = await Request.findById(order.requestId);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    request.latitude = Number(latitude);
    request.longitude = Number(longitude);
    await request.save();

    res.json({ message: 'Customer coordinates cached successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  saveCustomerCoordinates,
  handleMsg91Webhook,
  partnerLogin,
  partnerLogout,
  getMe,
  getAssignedOrders,
  getOrderDetails,
  startOrderNavigation,
  arriveOrder,
  generateOtp,
  verifyOtpAndComplete,
  addExtraDevice,
  updateGps,
  uploadImage,
  getWarehouseOrders,
  verifyWarehouseOrder,
  adminGetPartners,
  adminCreatePartner,
  adminUpdatePartner,
  adminAssignOrder,
  adminGetPerformanceDashboard,
  adminGetLiveLocations,
  adminGetOrderByRequestId,
  updateDutyStatus,
  cancelOrder,
  getPartnerStats,
  adminGetPartnerProfile,
  adminGetOrderDetails,
  adminGetAnalytics
};
