export const boatScaleDivisor = 5.0;

const sailOffset = -6;
const navLightSize = 4;

/* Edge doesn't support SVG string in Path2D constructor. Thus, create the
 * shapes one bit at a time instead.
 */
const boatPath = new Path2D();
boatPath.moveTo(-3, 11);
boatPath.bezierCurveTo(-5, 7, -6, -1, 0, -13);
boatPath.bezierCurveTo(6, -1, 5, 7, 3, 11);
boatPath.closePath();

const sailPath = new Path2D();
sailPath.moveTo(0, 0);
sailPath.bezierCurveTo(-3, 5, -3, 12, 0, 17);

const sailTwa0Path = new Path2D();
sailTwa0Path.moveTo(0, 0);
sailTwa0Path.lineTo(0, 17);

export function drawBoat(ctx, course, twa) {
  const sangle = sailAngle(twa);

  ctx.rotate(course);
  ctx.stroke(boatPath);
  ctx.translate(0, sailOffset);
  ctx.rotate(sangle);
  if (twa < 0) {
    ctx.scale(-1, 1);
  }
  if (twa === 0) {
    ctx.stroke(sailTwa0Path);
  } else {
    ctx.stroke(sailPath);
  }
  if (sangle < 0) {
    ctx.scale(-1, 1);
  }
  ctx.rotate(-sangle);
  ctx.translate(0, -sailOffset);
  ctx.rotate(-course);
}

export function drawNavLights(ctx, course) {
  ctx.rotate(course);

  ctx.fillStyle = "red";
  ctx.arc(0, 0, navLightSize, Math.PI - Math.PI / 6, Math.PI * 1.5);
  ctx.lineTo(0, 0);
  ctx.fill();

  ctx.beginPath();
  ctx.fillStyle = "rgb(80,255,80)";
  ctx.arc(0, 0, navLightSize, Math.PI * 1.5, Math.PI / 6);
  ctx.lineTo(0, 0);
  ctx.fill();

  ctx.rotate(-course);
}

/* FIXME:
 * perhaps some AWA based calculation could result in a better angle
 * maxvmg angle should be consider especially for headwind
 */
export function sailAngle (twa) {
  return twa / (180 / 75);
}
