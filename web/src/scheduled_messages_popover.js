import $ from "jquery";
import {delegate} from "tippy.js";

import render_send_later_modal from "../templates/send_later_modal.hbs";
import render_send_later_modal_options from "../templates/send_later_modal_options.hbs";
import render_send_later_popover from "../templates/send_later_popover.hbs";

import * as compose from "./compose";
import * as compose_validate from "./compose_validate";
import * as flatpickr from "./flatpickr";
import * as overlays from "./overlays";
import * as popover_menus from "./popover_menus";
import * as scheduled_messages from "./scheduled_messages";
import {parse_html} from "./ui_util";

export const SCHEDULING_MODAL_UPDATE_INTERVAL_IN_MILLISECONDS = 60 * 1000;

function set_compose_box_schedule(element) {
    const selected_send_at_time = element.dataset.sendStamp / 1000;
    return selected_send_at_time;
}

export function open_send_later_menu() {
    if (!compose_validate.validate(true)) {
        return;
    }

    // Only show send later options that are possible today.
    const date = new Date();
    const filtered_send_opts = scheduled_messages.get_filtered_send_opts(date);
    $("body").append(render_send_later_modal(filtered_send_opts));
    let interval;

    overlays.open_modal("send_later_modal", {
        autoremove: true,
        on_show() {
            interval = setInterval(
                update_send_later_options,
                SCHEDULING_MODAL_UPDATE_INTERVAL_IN_MILLISECONDS,
            );

            const $send_later_modal = $("#send_later_modal");

            // Upon the first keydown event, we focus on the first element in the list,
            // enabling keyboard navigation that is handled by `hotkey.js` and `list_util.ts`.
            $send_later_modal.one("keydown", () => {
                const $options = $send_later_modal.find("a");
                $options[0].focus();

                $send_later_modal.on("keydown", (e) => {
                    if (e.key === "Enter") {
                        e.target.click();
                    }
                });
            });

            $send_later_modal.on("click", ".send_later_custom", (e) => {
                const $send_later_modal_content = $send_later_modal.find(".modal__content");
                const current_time = new Date();
                flatpickr.show_flatpickr(
                    $(".send_later_custom")[0],
                    do_schedule_message,
                    new Date(current_time.getTime() + 60 * 60 * 1000),
                    {
                        minDate: new Date(
                            current_time.getTime() +
                                scheduled_messages.MINIMUM_SCHEDULED_MESSAGE_DELAY_SECONDS * 1000,
                        ),
                        onClose() {
                            // Return to normal state.
                            $send_later_modal_content.css("pointer-events", "all");
                        },
                    },
                );
                // Disable interaction with rest of the options in the modal.
                $send_later_modal_content.css("pointer-events", "none");
                e.preventDefault();
                e.stopPropagation();
            });
            $send_later_modal.one(
                "click",
                ".send_later_today, .send_later_tomorrow, .send_later_monday",
                (e) => {
                    const send_at_time = set_compose_box_schedule(e.currentTarget);
                    do_schedule_message(send_at_time);
                    e.preventDefault();
                    e.stopPropagation();
                },
            );
        },
        on_shown() {
            // When shown, we should give the modal focus to correctly handle keyboard events.
            const $send_later_modal_overlay = $("#send_later_modal .modal__overlay");
            $send_later_modal_overlay.trigger("focus");
        },
        on_hide() {
            clearInterval(interval);
        },
    });
}

export function do_schedule_message(send_at_time) {
    overlays.close_modal_if_open("send_later_modal");

    if (!Number.isInteger(send_at_time)) {
        // Convert to timestamp if this is not a timestamp.
        send_at_time = Math.floor(Date.parse(send_at_time) / 1000);
    }
    scheduled_messages.set_selected_schedule_timestamp(send_at_time);
    compose.finish(true);
}

export function initialize() {
    delegate("body", {
        ...popover_menus.default_popover_props,
        target: "#send_later i",
        onUntrigger() {
            // This is only called when the popover is closed by clicking on `target`.
            $("#compose-textarea").trigger("focus");
        },
        onShow(instance) {
            const formatted_send_later_time =
                scheduled_messages.get_formatted_selected_send_later_time();
            instance.setContent(
                parse_html(
                    render_send_later_popover({
                        formatted_send_later_time,
                    }),
                ),
            );
            popover_menus.popover_instances.send_later = instance;
            $(instance.popper).one("click", instance.hide);
        },
        onMount(instance) {
            const $popper = $(instance.popper);
            $popper.one("click", ".send_later_selected_send_later_time", () => {
                const send_at_timestamp = scheduled_messages.get_selected_send_later_timestamp();
                do_schedule_message(send_at_timestamp);
            });
            $popper.one("click", ".open_send_later_modal", open_send_later_menu);
        },
        onHidden(instance) {
            instance.destroy();
            popover_menus.popover_instances.send_later = undefined;
        },
    });
}

// This function is exported for unit testing purposes.
export function should_update_send_later_options(date) {
    const current_minute = date.getMinutes();
    const current_hour = date.getHours();

    if (current_hour === 0 && current_minute === 0) {
        // We need to rerender the available options at midnight,
        // since Monday could become in range.
        return true;
    }

    // Rerender at MINIMUM_SCHEDULED_MESSAGE_DELAY_SECONDS before the
    // hour, so we don't offer a 4:00PM send time at 3:59 PM.
    return current_minute === 60 - scheduled_messages.MINIMUM_SCHEDULED_MESSAGE_DELAY_SECONDS / 60;
}

export function update_send_later_options() {
    const now = new Date();
    if (should_update_send_later_options(now)) {
        const filtered_send_opts = scheduled_messages.get_filtered_send_opts(now);
        $("#send_later_options").replaceWith(render_send_later_modal_options(filtered_send_opts));
    }
}
