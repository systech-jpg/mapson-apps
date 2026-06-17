<?php

namespace App\Notifications;

use App\Models\OvertimePeriod;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class OvertimeDecisionNotification extends Notification
{
    use Queueable;

    /** @param  string  $outcome  'approved' | 'rejected' */
    public function __construct(public OvertimePeriod $overtime, public string $outcome)
    {
    }

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        $channels = ['database'];
        if (config('leave.notify_mail')) {
            $channels[] = 'mail';
        }

        return $channels;
    }

    private function label(): string
    {
        return $this->outcome === 'approved' ? 'disetujui' : 'ditolak';
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'kind' => 'overtime_decision',
            'overtime_id' => $this->overtime->id,
            'request_number' => $this->overtime->request_number,
            'outcome' => $this->outcome,
            'message' => "Lembur {$this->overtime->request_number} Anda telah {$this->label()}.",
            'url' => route('overtime.index'),
        ];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject("Lembur {$this->label()}: {$this->overtime->request_number}")
            ->line("Pengajuan lembur Anda ({$this->overtime->request_number}) telah {$this->label()}.")
            ->action('Buka Lembur Saya', route('overtime.index'));
    }
}
